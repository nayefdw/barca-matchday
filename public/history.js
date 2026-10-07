// Shared by the Worker and UI: only completed meetings before the selected game.
export function recentMeetings(fixtures, match, now = Date.now(), limit = 5) {
  const pair = [match.homeTeam.id, match.awayTeam.id].sort((a,b)=>a-b).join(':');
  const cutoff = Math.min(now, Date.parse(match.kickoffUtc));
  const unique = new Map();
  for (const f of fixtures) {
    if (f.id === match.id || !['FINISHED','AWARDED'].includes(f.status) ||
        ![f.score?.home,f.score?.away].every(n=>Number.isInteger(n)&&n>=0) ||
        !Number.isFinite(Date.parse(f.kickoffUtc)) || Date.parse(f.kickoffUtc) >= cutoff ||
        [f.homeTeam?.id,f.awayTeam?.id].sort((a,b)=>a-b).join(':') !== pair) continue;
    unique.set(f.id, f);
  }
  return [...unique.values()].sort((a,b)=>Date.parse(b.kickoffUtc)-Date.parse(a.kickoffUtc)).slice(0,limit);
}
export function meetingOutcome(f) {
  const home = f.homeTeam.id === 81;
  let own = home ? f.score.home : f.score.away, other = home ? f.score.away : f.score.home;
  if (own===other && f.score.duration==='PENALTY_SHOOTOUT' &&
      [f.score.penalties?.home,f.score.penalties?.away].every(n=>Number.isInteger(n)&&n>=0)) {
    own = home ? f.score.penalties.home : f.score.penalties.away;
    other = home ? f.score.penalties.away : f.score.penalties.home;
  }
  return own===other?'D':own>other?'W':'L';
}
