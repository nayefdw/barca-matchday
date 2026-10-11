const MINUTE=60000,HOUR=60*MINUTE,DAY=24*HOUR;
export const reminderMark=(fixture,subscriber)=>fixture.id+'|'+fixture.kickoffUtc+'|'+subscriber.leadMinutes;
// Persist exact events, not a recurring check. Pending kickoff times get two
// confirmation checks around their announced match date, never a reminder.
export function matchPlan(snapshot,subscribers,state={},now=Date.now()){
 const events=[],checkedAt=Date.parse(snapshot?.checkedAt)||0,completed=state.completed||{};
 for(const [id,retry] of Object.entries(state.retries||{}))if(now<retry.deadline)events.push({id,kind:'refresh',phase:retry.phase,at:retry.at,deadline:retry.deadline,retry:true});
 if(!snapshot||snapshot.demo)return events;
 for(const f of snapshot.fixtures||[]){
  if(['CANCELLED','POSTPONED','AWARDED'].includes(f.status))continue;
  const kickoff=Date.parse(f.kickoffUtc);if(!Number.isFinite(kickoff))continue;
  const addRefresh=(phase,at,deadline)=>{
   const id=[phase,f.id,f.kickoffUtc].join('|');
   if(!completed[id]&&checkedAt<at&&now<deadline)events.push({id,kind:'refresh',phase,at,deadline});
  };
  if(!f.timeConfirmed){
   if(f.status!=='SCHEDULED'&&f.status!=='TIMED')continue;
   const morning=Date.parse(f.kickoffUtc.slice(0,10)+'T09:00:00Z');
   addRefresh('confirm-day-before',morning-DAY,morning);
   addRefresh('confirm-matchday',morning,morning+DAY);
   addRefresh('after-date',morning+DAY,morning+4*DAY);
   continue;
  }
  if(f.status==='TIMED'&&kickoff>now){
   const lead=Math.max(30,...subscribers.map(s=>s.leadMinutes));
   addRefresh('before',kickoff-lead*MINUTE-10*MINUTE,kickoff);
   for(const s of Number.isFinite(Date.parse(snapshot.checkedAt))?subscribers:[]){
    const due=kickoff-s.leadMinutes*MINUTE,deadline=Math.min(kickoff,due+Math.min(30,s.leadMinutes)*MINUTE);
    if(s.sent?.[reminderMark(f,s)]||now>=deadline)continue;
    const at=Math.max(due,Date.parse(s.retryAfterAt)||0,now);
    if(at<deadline)events.push({id:'reminder|'+reminderMark(f,s),kind:'reminder',at,deadline});
   }
  }
  addRefresh('after',kickoff+3*HOUR,kickoff+3*DAY);
 }
 return events.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
}
export function nextDeviceReminder(snapshot,subscriber,now=Date.now()){
 const event=matchPlan(snapshot,[subscriber],{},now).find(e=>e.kind==='reminder');
 return event?new Date(event.at).toISOString():null;
}
