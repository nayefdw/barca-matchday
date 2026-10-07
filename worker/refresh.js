import { normalizeMatches, COVERAGE } from './normalize.js';
export function refreshInterval(snapshot, now) {
  if(snapshot?.fixtures.some(f=>['IN_PLAY','PAUSED','SUSPENDED'].includes(f.status)||f.status==='TIMED'&&Date.parse(f.kickoffUtc)<=now&&now-Date.parse(f.kickoffUtc)<3*3600000))return 300000;
  return snapshot?.fixtures.some(f => !['FINISHED', 'CANCELLED', 'AWARDED'].includes(f.status) && f.timeConfirmed && Math.abs(Date.parse(f.kickoffUtc) - now) < 24 * 3600000) ? 3600000 : 6 * 3600000;
}
export async function refresh(env, { now = Date.now(), fetcher = fetch } = {}) {
  if (!env.FIXTURES || !env.FOOTBALL_DATA_TOKEN) return { skipped: 'not-configured' };
  const current = await env.FIXTURES.get('snapshot', 'json');
  const meta = await env.FIXTURES.get('meta', 'json') || {};
  const interval = refreshInterval(current, now);
  if (meta.lastAttemptAt && now - Date.parse(meta.lastAttemptAt) < Math.min(interval, 3600000)) return { skipped: 'attempted-recently' };
  if (meta.lastSuccessAt && now - Date.parse(meta.lastSuccessAt) < interval) return { skipped: 'not-due' };
  const at = new Date(now).toISOString();
  await env.FIXTURES.put('meta', JSON.stringify({ ...meta, lastAttemptAt: at }));
  try {
    const teamId = Number(env.TEAM_ID || 81);
    if (!Number.isInteger(teamId) || teamId < 1) throw new Error('Invalid team configuration');
    const from = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
    const to = new Date(now + 300 * 86400000).toISOString().slice(0, 10);
    const url = `https://api.football-data.org/v4/teams/${teamId}/matches?dateFrom=${from}&dateTo=${to}&limit=500`;
    const response = await fetcher(url, { headers: { 'X-Auth-Token': env.FOOTBALL_DATA_TOKEN }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    const fixtures = normalizeMatches(await response.json(), current, at, teamId);
    const snapshot = { schemaVersion: 1, checkedAt: at, coverage: COVERAGE, fixtures, demo: false };
    if (current) await env.FIXTURES.put('snapshot_prev', JSON.stringify(current));
    await env.FIXTURES.put('snapshot', JSON.stringify(snapshot));
    await env.FIXTURES.put('meta', JSON.stringify({ lastAttemptAt: at, lastSuccessAt: at, failures: 0 }));
    return { updated: fixtures.length };
  } catch (error) {
    await env.FIXTURES.put('meta', JSON.stringify({ ...meta, lastAttemptAt: at, failures: (meta.failures || 0) + 1, lastError: error.message }));
    return { error: error.message };
  }
}
