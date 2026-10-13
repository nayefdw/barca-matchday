import {refresh} from './refresh.js';
import {sendReminders,pushRequest,pushConfigured,safeEndpoint,LEAD_TIMES} from './push.js';
import {refreshTeam} from './team.js';
import {refreshStandings} from './standings.js';
import {refreshHistory} from './history.js';
import {refreshStadiums} from './stadiums.js';
import {matchPlan,nextDeviceReminder} from './match-schedule.js';
import {updateLiveMatches,summaryResponse} from './match-summary.js';

// SQLite-backed Durable Object storage is the authoritative state. KV remains
// the public data cache and a best-effort backup, never the alarm/dedup store.
class SchedulerStore{
 constructor(storage,kv){this.storage=storage;this.kv=kv;}
 async get(key,type){const value=await this.storage.get(key);return value==null?null:type==='json'?JSON.parse(value):value;}
 async put(key,value){
  await this.storage.put(key,value);
  try{await this.kv.put(key,value);}catch{console.warn('Matchday cache mirror unavailable');}
 }
 async delete(key){await this.storage.delete(key);try{await this.kv.delete(key);}catch{console.warn('Matchday cache mirror unavailable');}}
 async list({prefix,limit}){const values=await this.storage.list({prefix,limit});return {keys:[...values.keys()].map(name=>({name})),list_complete:true};}
}
export class SchedulerCore{
 constructor(ctx,env,jobs={}){
  this.ctx=ctx;this.env=env;this.tail=Promise.resolve();this.clock=jobs.clock||Date.now;
  this.jobs={refresh,sendReminders,refreshTeam,refreshStandings,refreshHistory,refreshStadiums,updateLiveMatches,...jobs};
  this.store=new SchedulerStore(ctx.storage,env.FIXTURES);
  this.scheduledEnv={...env,FIXTURES:this.store,nextDeviceReminder:(snapshot,subscriber)=>nextDeviceReminder(snapshot,subscriber,this.clock())};
 }
 exclusive(work){const promise=this.tail.then(work);this.tail=promise.catch(()=>{});return promise;}
 async initialize(){
  if(await this.ctx.storage.get('initialized'))return;
  const seed={};
  for(const name of ['snapshot','meta']){const value=await this.env.FIXTURES.get(name);if(value!=null)seed[name]=value;}
  const list=await this.env.FIXTURES.list({prefix:'push_sub_',limit:20});
  for(const item of list.keys){const value=await this.env.FIXTURES.get(item.name);if(value!=null)seed[item.name]=value;}
  const now=this.clock();
  seed.initialized=true;seed.scheduleState={completed:{},retries:!seed.snapshot&&this.env.FOOTBALL_DATA_TOKEN?{bootstrap:{at:now+1000,deadline:now+3600000,phase:'bootstrap',attempt:0}}:{}};
  // One atomic bootstrap preserves existing device ownership and preferences.
  await this.ctx.storage.put(seed);
 }
 async inputs(){
  const snapshot=await this.store.get('snapshot','json'),list=await this.ctx.storage.list({prefix:'push_sub_',limit:20});
  return {snapshot,subscribers:[...list.values()].map(v=>JSON.parse(v)),state:await this.ctx.storage.get('scheduleState')||{completed:{},retries:{}}};
 }
 plan({snapshot,subscribers,state},now){
  const valid=pushConfigured(this.scheduledEnv)?subscribers.filter(s=>LEAD_TIMES.includes(s.leadMinutes)&&safeEndpoint(s.subscription?.endpoint)):[];
  return matchPlan(snapshot,valid,state,now);
 }
 async arm(now=this.clock()){
  const events=this.plan(await this.inputs(),now);
  const current=await this.ctx.storage.getAlarm();
  const alarm=events.length?(events[0].at<=now&&current&&current<=now?current:Math.max(now+1000,events[0].at)):null;
  if(alarm!==current){if(alarm==null)await this.ctx.storage.deleteAlarm();else await this.ctx.storage.setAlarm(alarm);}
  return {events,alarm};
 }
 async status(){
  const {events,alarm}=await this.arm(),nextUpdate=events.find(e=>e.kind==='refresh'||e.kind==='match-live'),nextReminder=events.find(e=>e.kind==='reminder');
  return {mode:'match-times',alarmAt:alarm?new Date(alarm).toISOString():null,nextUpdateAt:nextUpdate?new Date(nextUpdate.at).toISOString():null,nextReminderAt:nextReminder?new Date(nextReminder.at).toISOString():null,lastRun:await this.ctx.storage.get('lastRun')||null};
 }
 async fetch(request){return this.exclusive(async()=>{
  await this.initialize();
  if(new URL(request.url).pathname==='/api/match-summary')return summaryResponse(request,this.scheduledEnv,{now:this.clock()});
  if(new URL(request.url).pathname==='/internal/schedule')return Response.json(await this.status());
  if(new URL(request.url).pathname==='/internal/fixtures')return Response.json({snapshot:await this.store.get('snapshot','json'),meta:await this.store.get('meta','json')||{},schedule:await this.status()});
  const response=await pushRequest(request,this.scheduledEnv);
  await this.arm();
  if(new URL(request.url).pathname==='/api/push/config'&&request.method==='GET'&&response.ok){
   const value=await response.json();return Response.json({...value,scheduling:'match-times'},{headers:{'Cache-Control':'no-store'}});
  }
  return response;
 });}
 async alarm(){return this.exclusive(async()=>{
  await this.initialize();const now=this.clock(),input=await this.inputs(),{state}=input;
  const due=this.plan(input,now).filter(e=>e.at<=now),updates=due.filter(e=>e.kind==='refresh');
  const result={at:new Date(now).toISOString(),refresh:'not-due',sent:0};
  try{
   if(updates.length){
    let refreshed;
    try{refreshed=await this.jobs.refresh(this.scheduledEnv,{now,force:true});}
    catch{refreshed={error:'refresh-failed'};}
    result.refresh=refreshed.updated!=null?'updated':'failed';
    for(const event of updates){
     state.completed[event.id]=result.at;
     const attempt=(state.retries[event.id]?.attempt||0)+1;
     delete state.retries[event.id];
     const retryAt=now+5*60000*2**(attempt-1);
     if(result.refresh==='failed'&&attempt<=3&&retryAt<event.deadline)state.retries[event.id]={at:retryAt,deadline:event.deadline,phase:event.phase,attempt};
    }
    state.completed=Object.fromEntries(Object.entries(state.completed).slice(-400));
    await this.ctx.storage.put('scheduleState',state);
   }
   const live=due.filter(event=>event.kind==='match-live');
   if(live.length){
    try{result.live=await this.jobs.updateLiveMatches(this.scheduledEnv,{now,fixtures:live.map(event=>event.matchId),force:live.some(event=>event.phase==='final-details')});}
    catch{result.live={error:'official-match-update-failed'};}
    state.liveAttempts={...state.liveAttempts};state.finalDetailsCompleted={...state.finalDetailsCompleted};
    for(const event of live){state.liveAttempts[event.matchId]=now;if(event.phase==='final-details')state.finalDetailsCompleted[event.matchId]=true;}
    // Record attempts even on outage so unavailable data cannot cause a tight loop.
    state.liveAttempts=Object.fromEntries(Object.entries(state.liveAttempts).slice(-60));
    state.finalDetailsCompleted=Object.fromEntries(Object.entries(state.finalDetailsCompleted).slice(-60));
    await this.ctx.storage.put('scheduleState',state);
   }
   // Re-evaluate the refreshed schedule so a moved/cancelled match cannot use
   // the previous due event. A provider outage leaves confirmed cached times
   // eligible; it does not silently suppress all reminders.
   const current=await this.inputs();
   if(this.plan(current,now).some(e=>e.kind==='reminder'&&e.at<=now)){
    const sent=await this.jobs.sendReminders(this.scheduledEnv,{now,scheduled:true});result.sent=sent.sent||0;
   }
   // Optional photos/tables refresh around a match, never on idle-day polling.
   if(result.refresh==='updated')for(const name of ['refreshStandings','refreshTeam','refreshHistory','refreshStadiums']){
    try{await this.jobs[name](this.env,{now});}catch{console.warn('Matchday optional update unavailable',name);}
   }
   await this.ctx.storage.put('lastRun',result);
  }catch(error){throw error;}
  // If durable storage unexpectedly fails, let the platform retry the alarm;
  // do not create our own immediate retry loop alongside its built-in retries.
  await this.arm(this.clock());
  return result;
 });}
}
