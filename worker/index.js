import {refreshStadiums,stadiumResponse} from './stadiums.js';
import {historyResponse,refreshHistory} from './history.js';
import { calendarResponse, calendarEligible } from './calendar.js';
import { refresh, refreshInterval } from './refresh.js';
import { refreshTeam } from './team.js';
import { refreshStandings, TABLE_COMPETITIONS } from './standings.js';
import {pushRequest,sendReminders} from './push.js';
export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if(url.pathname.startsWith('/api/push/'))return pushRequest(request,env);
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  if(url.pathname==='/api/stadiums')return stadiumResponse(request,env);
  if(url.pathname==='/api/head-to-head')return historyResponse(request,env);
  if(url.pathname==='/api/standings'){
    const competition=url.searchParams.get('competition')||'PD';
    if(!TABLE_COMPETITIONS[competition])return Response.json({error:'Unknown competition'},{status:400});
    const snapshot=await env.FIXTURES?.get('standings_'+competition,'json');
    if(!snapshot)return Response.json({error:'Competition table is not available yet.'},{status:503,headers:{'Cache-Control':'no-store'}});
    const meta=await env.FIXTURES.get('standings_'+competition+'_meta','json')||{};
    const payload={...snapshot,stale:Date.now()-Date.parse(snapshot.checkedAt)>12*3600000,refreshFailed:!!meta.failures};
    return new Response(request.method==='HEAD'?null:JSON.stringify(payload),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  if (url.pathname === '/api/team') {
    const team=await env.FIXTURES?.get('team_snapshot','json');
    if (!team) return Response.json({error:'Team data is not available yet.'},{status:503,headers:{'Cache-Control':'no-store'}});
    const meta=await env.FIXTURES.get('team_meta','json') || {};
    const payload={...team,stale:Date.now()-Date.parse(team.checkedAt)>48*3600000,refreshFailed:!!meta.failures};
    return new Response(request.method==='HEAD'?null:JSON.stringify(payload),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  if (url.pathname === '/api/fixtures' || url.pathname.startsWith('/calendar/')) {
    const snapshot = await env.FIXTURES?.get('snapshot', 'json');
    if (!snapshot) return new Response(url.pathname.startsWith('/calendar/') ? 'Calendar is not ready yet.' : JSON.stringify({ error: 'Fixture data is not available yet.' }), { status: 503, headers: { 'Content-Type': url.pathname.startsWith('/calendar/') ? 'text/plain' : 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '3600' } });
    const meta = await env.FIXTURES.get('meta', 'json') || {};
    if (url.pathname.startsWith('/calendar/')) {
      if (snapshot.demo) return new Response('Demo fixtures cannot be subscribed to.', { status: 503 });
      const competition = url.searchParams.get('competition') || 'all';
      if (!['all', 'PD', 'CL'].includes(competition)) return new Response('Unknown competition', { status: 400 });
      const match = /^\/calendar\/match\/([a-zA-Z0-9-]+)\.ics$/.exec(url.pathname);
      if (url.pathname !== '/calendar/barca.ics' && !match) return new Response('Not found', { status: 404 });
      return calendarResponse(request, snapshot, { competition, matchId: match?.[1] });
    }
    const origin = env.SITE_ORIGIN || url.origin;
    let calendarUrl = null;
    try { const configured = new URL('/calendar/barca.ics', origin); if (configured.protocol === 'https:') calendarUrl = configured.href; } catch {}
    const interval = refreshInterval(snapshot, Date.now());
    const payload = { ...snapshot, checkedAt: meta.lastSuccessAt || snapshot.checkedAt,
      stale: Date.now() - Date.parse(meta.lastSuccessAt || snapshot.checkedAt) > interval * 2,
      refreshFailed: Boolean(meta.failures), nextRefreshAt: new Date(Date.parse(meta.lastSuccessAt || snapshot.checkedAt) + interval).toISOString(),
      calendarUrl, calendarReady: !snapshot.demo && !!calendarUrl && snapshot.fixtures.some(calendarEligible) };
    return new Response(request.method === 'HEAD' ? null : JSON.stringify(payload), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
  return env.ASSETS.fetch(request);
}
export default { fetch: handleRequest, async scheduled(event, env) { await refresh(env, { now:event.scheduledTime }); await sendReminders(env, { now:event.scheduledTime }); await refreshStandings(env, { now:event.scheduledTime }); await refreshTeam(env, { now:event.scheduledTime }); await refreshHistory(env, { now:event.scheduledTime }); await refreshStadiums(env, { now:event.scheduledTime }); } };
