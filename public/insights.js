export function matchResult(f) {
  if (!['FINISHED', 'AWARDED'].includes(f.status) ||
      !Number.isInteger(f.score?.home) || !Number.isInteger(f.score?.away)) return null;
  const own = f.homeTeam.id === 81 ? f.score.home : f.score.away;
  const other = f.homeTeam.id === 81 ? f.score.away : f.score.home;
  return { outcome:own === other ? 'D' : own > other ? 'W' : 'L', own, other };
}
export function finishedFixtures(fixtures) {
  return fixtures.filter(f => matchResult(f)).sort((a,b) => Date.parse(b.kickoffUtc) - Date.parse(a.kickoffUtc));
}
export function recentForm(fixtures, limit = 5) {
  return finishedFixtures(fixtures).slice(0,limit).reverse().map(f => ({ fixture:f, ...matchResult(f) }));
}
export function countdownParts(f, now = Date.now()) {
  if (!f?.timeConfirmed || f.status !== 'TIMED') return null;
  const minutes = Math.floor((Date.parse(f.kickoffUtc) - now) / 60000);
  if (minutes < 0 || Date.parse(f.kickoffUtc) <= now) return null;
  return { days:Math.floor(minutes / 1440), hours:Math.floor(minutes % 1440 / 60), minutes:minutes % 60 };
}
export function dateKey(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  const valueOf = type => parts.find(p=>p.type===type).value;
  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`;
}
export function shiftMonth(year, month, step) {
  const value = new Date(Date.UTC(year,month - 1 + step,15));
  return { year:value.getUTCFullYear(),month:value.getUTCMonth()+1 };
}
export function monthCalendar(fixtures, {year,month,timeZone,competition='all',now=Date.now()}) {
  const prefix = `${year}-${String(month).padStart(2,'0')}`;
  const byDate = new Map();
  for (const f of fixtures) {
    if ((!f.timeConfirmed&&f.status!=='SCHEDULED') || ['POSTPONED','CANCELLED'].includes(f.status) || (competition!=='all'&&f.competition!==competition)) continue;
    const key = fixtureDateKey(f,timeZone);
    if (!key.startsWith(prefix+'-')) continue;
    if (!byDate.has(key)) byDate.set(key,[]);
    byDate.get(key).push(f);
  }
  const today = dateKey(now,timeZone);
  const count = new Date(Date.UTC(year,month,0)).getUTCDate();
  return {
    offset:(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7,
    days:Array.from({length:count},(_,index)=>{
      const key = `${prefix}-${String(index+1).padStart(2,'0')}`;
      return { key,day:index+1,today:key===today,fixtures:(byDate.get(key)||[]).sort((a,b)=>Date.parse(a.kickoffUtc)-Date.parse(b.kickoffUtc)) };
    })
  };
}
export function fixtureDateKey(f,timeZone){
 return f.timeConfirmed?dateKey(f.kickoffUtc,timeZone):f.kickoffUtc.slice(0,10);
}
export function searchFixtures(fixtures, query) {
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  return fixtures.filter(f=>{
    const text = normalize(`${f.homeTeam.name} ${f.awayTeam.name} ${f.homeTeam.tla} ${f.awayTeam.tla} ${f.competitionName}`);
    return terms.every(term=>text.includes(term));
  });
}
export function trackedStats(fixtures) {
  const games = finishedFixtures(fixtures);
  const summary = { played:games.length,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0,home:0,away:0 };
  for (const f of games) {
    const result=matchResult(f);
    summary[result.outcome==='W'?'wins':result.outcome==='D'?'draws':'losses']++;
    summary.goalsFor+=result.own;summary.goalsAgainst+=result.other;
    summary[f.homeTeam.id===81?'home':'away']++;
  }
  return summary;
}
