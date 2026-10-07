export const FUTURE = ['TIMED', 'SCHEDULED', 'POSTPONED'];
export function upcoming(fixtures, now = Date.now()) {
  return fixtures.filter(f => FUTURE.includes(f.status) && (f.status === 'POSTPONED' || Date.parse(f.kickoffUtc) > now))
    .sort((a, b) => (a.status === 'POSTPONED') - (b.status === 'POSTPONED') || Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc));
}
export function currentMatch(fixtures, now = Date.now()) {
  return fixtures.find(f => ['IN_PLAY', 'PAUSED', 'SUSPENDED'].includes(f.status)) ||
    fixtures.find(f => ['TIMED', 'SCHEDULED'].includes(f.status) && Date.parse(f.kickoffUtc) <= now && now - Date.parse(f.kickoffUtc) < 2 * 3600000);
}
export function stateLabel(f, now = Date.now()) {
  const labels = { POSTPONED: 'Postponed · new time TBC', CANCELLED: 'Cancelled', SUSPENDED: 'Suspended · delayed status', IN_PLAY: 'In progress · delayed status', PAUSED: 'Half-time · delayed status', FINISHED: 'Full time', AWARDED: 'Awarded result' };
  if (labels[f.status]) return labels[f.status];
  if (!f.timeConfirmed) return 'Kickoff time to be confirmed';
  if (Date.parse(f.kickoffUtc) <= now) return 'Scheduled start passed · status unavailable';
  return 'Kickoff confirmed';
}
export function countdown(f, now = Date.now()) {
  if (!f?.timeConfirmed || f.status !== 'TIMED') return null;
  const total = Math.floor((Date.parse(f.kickoffUtc) - now) / 60000);
  if (total <= 0) return null;
  const days = Math.floor(total / 1440), hours = Math.floor(total % 1440 / 60), mins = total % 60;
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${mins}m` : `${mins}m`;
}
export const opponent = f => f.homeTeam.id === 81 ? f.awayTeam : f.homeTeam;
export const place = f => f.homeTeam.id === 81 ? 'Home' : 'Away';
