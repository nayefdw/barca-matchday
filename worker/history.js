import {clubTeam} from '../public/teams.js';
import {recentMeetings} from '../public/history.js';

const opponentId = match => match.homeTeam.id===81?match.awayTeam.id:match.homeTeam.id;
export function normalizeHistory(payload, match, checkedAt) {
  if (!Array.isArray(payload.matches) || payload.matches.length>100 || payload.errors || payload.error) throw new Error('Invalid history response');
  const rival=opponentId(match), ids=new Set();
  const fixtures=payload.matches.filter(m=>['FINISHED','AWARDED'].includes(m.status)).map(m=>{
    const teams=[m.homeTeam,m.awayTeam];
    if (!Number.isInteger(m.id) || m.id<1 || !Number.isFinite(Date.parse(m.utcDate)) ||
        !teams.every(t=>Number.isInteger(t?.id)&&typeof t.name==='string'&&t.name.trim()) ||
        !teams.some(t=>t.id===81) || !teams.some(t=>t.id===rival) ||
        ![m.score?.fullTime?.home,m.score?.fullTime?.away].every(n=>Number.isInteger(n)&&n>=0)) throw new Error('Malformed historical match');
    if (ids.has(m.id)) throw new Error('Duplicate historical match');
    ids.add(m.id);
    const penalties=m.score?.penalties;
    if (penalties && [penalties.home,penalties.away].some(n=>n!=null&&(!Number.isInteger(n)||n<0))) throw new Error('Malformed penalties');
    return {id:'fd-'+m.id,homeTeam:clubTeam(m.homeTeam),awayTeam:clubTeam(m.awayTeam),kickoffUtc:m.utcDate,
      status:m.status,timeConfirmed:true,competition:m.competition?.code||null,
      competitionName:typeof m.competition?.name==='string'?m.competition.name.slice(0,100):'Competition unavailable',
      score:{home:m.score.fullTime.home,away:m.score.fullTime.away,duration:m.score.duration||'REGULAR',penalties:penalties||null}};
  });
  return {schemaVersion:1,opponentId:rival,checkedAt,fixtures,demo:false};
}

// Warm shared history independently of page views: two provider calls per cron at most.
export async function refreshHistory(env,{now=Date.now(),fetcher=fetch}={}) {
  if (!env.FIXTURES || !env.FOOTBALL_DATA_TOKEN) return {skipped:'not-configured'};
  const snapshot=await env.FIXTURES.get('snapshot','json');
  if (!snapshot || snapshot.demo) return {skipped:'no-real-fixtures'};
  const future=snapshot.fixtures.filter(f=>Date.parse(f.kickoffUtc)>now&&!['CANCELLED','FINISHED','AWARDED'].includes(f.status)).sort((a,b)=>Date.parse(a.kickoffUtc)-Date.parse(b.kickoffUtc));
  const past=snapshot.fixtures.filter(f=>['FINISHED','AWARDED'].includes(f.status)).sort((a,b)=>Date.parse(b.kickoffUtc)-Date.parse(a.kickoffUtc));
  const candidates=[...new Map([...future,...past].filter(f=>/^fd-\d+$/.test(f.id)).map(f=>[opponentId(f),f])).values()];
  // Prefer an upcoming reference for each opponent.
  for (const f of future.slice().reverse()) {const index=candidates.findIndex(c=>opponentId(c)===opponentId(f));if(index>=0)candidates[index]=f;}
  let attempted=0, updated=0;
  for (const match of candidates) {
    if(attempted>=2)break;
    const key='history_'+opponentId(match),meta=await env.FIXTURES.get(key+'_meta','json')||{};
    const wait=meta.accessUnavailable?86400000:3600000;
    if(meta.lastAttemptAt&&now-Date.parse(meta.lastAttemptAt)<wait || meta.lastSuccessAt&&now-Date.parse(meta.lastSuccessAt)<86400000)continue;
    attempted++;const at=new Date(now).toISOString();
    await env.FIXTURES.put(key+'_meta',JSON.stringify({...meta,lastAttemptAt:at}));
    try {
      const response=await fetcher(`https://api.football-data.org/v4/matches/${match.id.slice(3)}/head2head?limit=10`,{headers:{'X-Auth-Token':env.FOOTBALL_DATA_TOKEN},signal:AbortSignal.timeout(12000)});
      if(!response.ok){const error=new Error('History provider returned '+response.status);error.accessUnavailable=[403,404].includes(response.status);throw error;}
      const history=normalizeHistory(await response.json(),match,at);
      await env.FIXTURES.put(key,JSON.stringify(history));
      await env.FIXTURES.put(key+'_meta',JSON.stringify({lastAttemptAt:at,lastSuccessAt:at,failures:0}));updated++;
    } catch(error) {
      await env.FIXTURES.put(key+'_meta',JSON.stringify({...meta,lastAttemptAt:at,failures:(meta.failures||0)+1,accessUnavailable:!!error.accessUnavailable,lastError:error.message}));
    }
  }
  return {attempted,updated};
}

export async function historyResponse(request, env) {
  const id=new URL(request.url).searchParams.get('match');
  if(!/^fd-\d+$/.test(id||''))return Response.json({error:'Invalid match'},{status:400});
  const snapshot=await env.FIXTURES?.get('snapshot','json');
  if(!snapshot)return Response.json({error:'Fixtures not available yet'},{status:503});
  const match=snapshot.fixtures.find(f=>f.id===id);
  if(!match)return Response.json({error:'Match not found'},{status:404});
  const key='history_'+opponentId(match),history=await env.FIXTURES.get(key,'json'),meta=await env.FIXTURES.get(key+'_meta','json')||{};
  const payload={schemaVersion:1,matchId:id,opponentId:opponentId(match),demo:!!snapshot.demo,
    checkedAt:history?.checkedAt||snapshot.checkedAt,limited:!history,refreshFailed:!!meta.failures,
    stale:!!history&&Date.now()-Date.parse(history.checkedAt)>48*3600000,
    fixtures:recentMeetings([...(history?.fixtures||[]),...snapshot.fixtures],match)};
  return new Response(request.method==='HEAD'?null:JSON.stringify(payload),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}
