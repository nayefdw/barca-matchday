const encoder = new TextEncoder();
export const escapeText = value => String(value ?? '').replaceAll('\\', '\\\\').replace(/\r\n|\r|\n/g, '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,');
export function foldLine(line) {
  let lines = [], current = '', length = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (length + bytes > 75) { lines.push(current); current = ' '; length = 1; }
    current += char; length += bytes;
  }
  lines.push(current);
  return lines.join('\r\n');
}
function stamp(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid calendar timestamp');
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
export function calendarEligible(f) {
  return Boolean(f.calendarStart && Number.isFinite(Date.parse(f.calendarStart)));
}
export function createCalendar(snapshot, { competition = 'all', matchId = null } = {}) {
  const fixtures = snapshot.fixtures.filter(f => (!matchId || f.id === matchId) && (competition === 'all' || f.competition === competition) && calendarEligible(f));
  const title = `Barça · ${competition === 'PD' ? 'La Liga' : competition === 'CL' ? 'Champions League' : 'Tracked fixtures'}`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cartel//Barca Fixtures//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escapeText(title)}`, 'X-WR-TIMEZONE:Europe/Madrid', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  for (const f of fixtures) {
    const cancelled = !f.timeConfirmed;
    const description = [f.competitionName, f.round, cancelled ? (f.status === 'POSTPONED' ? 'Postponed; new kickoff TBC.' : f.status === 'CANCELLED' ? 'Cancelled.' : 'Kickoff no longer confirmed; awaiting a new time.') : '',
      'La Liga and Champions League only. Cup fixtures are not included.',
      'End time is a two-hour calendar placeholder, not a confirmed final whistle.',
      'Football data provided by the Football-Data.org API'].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${f.id}@cartel-barca.fixtures`, `DTSTAMP:${stamp(f.changedAt || snapshot.checkedAt)}`,
      `LAST-MODIFIED:${stamp(f.changedAt || snapshot.checkedAt)}`, `SEQUENCE:${f.sequence || 0}`,
      `DTSTART:${stamp(f.calendarStart)}`, `DTEND:${stamp(Date.parse(f.calendarStart) + 2 * 3600000)}`,
      `SUMMARY:${escapeText(`${f.homeTeam.name} vs ${f.awayTeam.name}`)}`, `DESCRIPTION:${escapeText(description)}`,
      `LOCATION:${escapeText(f.venue || 'Venue to be confirmed')}`, `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
export async function calendarResponse(request, snapshot, options = {}) {
  if (options.matchId && !snapshot.fixtures.some(f => f.id === options.matchId)) return new Response('Match not found', { status: 404 });
  if (options.matchId && !snapshot.fixtures.some(f => f.id === options.matchId && calendarEligible(f))) return new Response('Kickoff is not confirmed', { status: 409 });
  const body = createCalendar(snapshot, options);
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(body));
  const etag = '"' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') + '"';
  const headers = { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'public, max-age=300, must-revalidate', ETag: etag,
    'Content-Disposition': `${options.matchId ? 'attachment' : 'inline'}; filename="barca${options.matchId ? '-match' : ''}.ics"`, 'X-Content-Type-Options': 'nosniff' };
  if ((request.headers.get('If-None-Match') || '').split(',').some(v => v.trim().replace(/^W\//, '') === etag || v.trim() === '*')) return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : body, { headers });
}
