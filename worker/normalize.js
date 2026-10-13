import { clubTeam } from '../public/teams.js';
export const COVERAGE = { PD: { name: 'La Liga', schedule: true, results: 'delayed' }, CL: { name: 'Champions League', schedule: true, results: 'delayed' } };
export function normalizeMatches(payload, previous, checkedAt, teamId = 81) {
  if (!Array.isArray(payload.matches) || payload.errors) throw new Error('Invalid provider response');
  if (payload.matches.length >= 500) throw new Error('Response may be truncated');
  const old = new Map((previous?.fixtures || []).map(f => [f.id, f]));
  const fixtures = payload.matches.filter(m => COVERAGE[m.competition?.code]).map(m => {
    if (!Number.isInteger(m.id) || typeof m.homeTeam?.name !== 'string' || typeof m.awayTeam?.name !== 'string' || !m.homeTeam.name || !m.awayTeam.name ||
        (m.homeTeam.id !== teamId && m.awayTeam.id !== teamId) || !Number.isFinite(Date.parse(m.utcDate))) throw new Error('Malformed match');
    for (const team of [m.homeTeam, m.awayTeam]) {
      if (!Number.isInteger(team.id) || (team.shortName != null && typeof team.shortName !== 'string') || (team.tla != null && typeof team.tla !== 'string')) throw new Error('Malformed team');
    }
    for (const value of [m.score?.fullTime?.home, m.score?.fullTime?.away, m.score?.penalties?.home, m.score?.penalties?.away]) {
      if (value != null && (!Number.isInteger(value) || value < 0)) throw new Error('Malformed score');
    }
    const id = `fd-${m.id}`;
    const before = old.get(id);
    const status = m.status;
    if (!['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED', 'FINISHED', 'POSTPONED', 'CANCELLED', 'SUSPENDED', 'AWARDED'].includes(status)) throw new Error('Unknown match status');
    const fixture = {
      id, competition: m.competition.code, competitionName: COVERAGE[m.competition.code].name,
      homeTeam: clubTeam(m.homeTeam), awayTeam: clubTeam(m.awayTeam),
      kickoffUtc: m.utcDate, timeConfirmed: !['SCHEDULED', 'POSTPONED', 'CANCELLED'].includes(status),
      status, venue: typeof m.venue === 'string' ? m.venue : null,
      round: Number.isInteger(m.matchday) && m.matchday > 0 ? `Matchday ${m.matchday}` : (typeof m.stage === 'string' ? m.stage.replaceAll('_', ' ') : ''),
      score: { home: m.score?.fullTime?.home ?? null, away: m.score?.fullTime?.away ?? null,
        duration: m.score?.duration || 'REGULAR', penalties: m.score?.penalties || null },
      source: 'football-data.org', sourceUpdatedAt: m.lastUpdated || checkedAt
    };
    if(before?.kickoffUtc===fixture.kickoffUtc){
      fixture.summaryFinalAt=before.summaryFinalAt||null;
      if(before.source==='FC Barcelona'&&['IN_PLAY','PAUSED','FINISHED'].includes(before.status)&&['TIMED','IN_PLAY','PAUSED'].includes(fixture.status)){
        fixture.status=before.status;fixture.score=before.score;fixture.matchClock=before.matchClock;
        fixture.source=before.source;fixture.sourceUpdatedAt=before.sourceUpdatedAt;
        fixture.venue=fixture.venue||before.venue;
      }
    }
    // Keep the last confirmed calendar time as a cancellation tombstone.
    fixture.calendarStart = fixture.timeConfirmed ? fixture.kickoffUtc : before?.calendarStart || null;
    fixture.calendarDate = fixture.calendarStart ? null : fixture.status==='SCHEDULED' ? fixture.kickoffUtc.slice(0,10) : before?.calendarDate || (before?.status==='SCHEDULED'?before.kickoffUtc.slice(0,10):null);
    const signature = JSON.stringify({ home: fixture.homeTeam.name, away: fixture.awayTeam.name,
      competition: fixture.competitionName, start: fixture.calendarStart, date: fixture.calendarDate, status: fixture.status, venue: fixture.venue, round: fixture.round });
    fixture.calendarSignature = signature;
    fixture.sequence = before ? (before.sequence || 0) + (before.calendarSignature === signature ? 0 : 1) : 0;
    fixture.changedAt = before?.calendarSignature === signature ? before.changedAt : checkedAt;
    return fixture;
  });
  if (new Set(fixtures.map(f => f.id)).size !== fixtures.length) throw new Error('Duplicate fixture IDs');
  const present = new Set(fixtures.map(f => f.id));
  const retention = Date.parse(checkedAt) - 30 * 86400000;
  const horizon = Date.parse(checkedAt) + 300 * 86400000;
  for (const f of old.values()) {
    const start = Date.parse(f.calendarStart || f.kickoffUtc);
    if (!present.has(f.id) && start >= retention && start <= horizon) {
      // A missing fixture is not evidence of cancellation. Preserve the last
      // complete snapshot by rejecting an incomplete provider response.
      if (!['CANCELLED', 'POSTPONED'].includes(f.status)) throw new Error('Previously known fixture missing');
      if (f.calendarStart || f.calendarDate) fixtures.push(f);
    }
  }
  return fixtures.sort((a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc));
}
