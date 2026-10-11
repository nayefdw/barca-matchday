import { clubTeam } from '../public/teams.js';
import { enrichPlayerPhotos } from './photos.js';
import { enrichPlayerProfiles } from './player-profiles.js';
import { enrichmentRetryWait } from './retry.js';
export function normalizeTeam(payload, checkedAt, teamId = 81) {
  if (payload.id !== teamId || typeof payload.name !== 'string' || !Array.isArray(payload.squad) || payload.squad.length > 150) throw new Error('Invalid team response');
  const squad = payload.squad.map(p => {
    if (!Number.isInteger(p.id) || typeof p.name !== 'string' || !p.name.trim()) throw new Error('Malformed player');
    return { id:p.id,name:p.name,position:typeof p.position==='string'?p.position:'Unspecified',
      nationality:typeof p.nationality==='string'?p.nationality:null,
      shirtNumber:Number.isInteger(p.shirtNumber)&&p.shirtNumber>0&&p.shirtNumber<100?p.shirtNumber:null };
  });
  if (new Set(squad.map(p=>p.id)).size !== squad.length) throw new Error('Duplicate player IDs');
  return { schemaVersion:1,checkedAt,demo:false,team:clubTeam(payload),squad,
    coach:typeof payload.coach?.name==='string'?payload.coach.name:null,source:'football-data.org' };
}
export async function refreshTeam(env,{now=Date.now(),fetcher=fetch}={}) {
  if (!env.FIXTURES || !env.FOOTBALL_DATA_TOKEN) return {skipped:'not-configured'};
  const meta = await env.FIXTURES.get('team_meta','json') || {};
  if (meta.lastAttemptAt && now-Date.parse(meta.lastAttemptAt)<enrichmentRetryWait(meta)) return {skipped:'attempted-recently'};
  if (meta.lastSuccessAt && now-Date.parse(meta.lastSuccessAt)<24*3600000) return {skipped:'not-due'};
  const at = new Date(now).toISOString();
  try {
    const teamId=Number(env.TEAM_ID || 81);
    if (!Number.isInteger(teamId)||teamId<1) throw new Error('Invalid team configuration');
    const response=await fetcher(`https://api.football-data.org/v4/teams/${teamId}`,{headers:{'X-Auth-Token':env.FOOTBALL_DATA_TOKEN},signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error(`Team provider returned ${response.status}`);
    const normalized=normalizeTeam(await response.json(),at,teamId);
    const previous=await env.FIXTURES.get('team_snapshot','json');
    const photographed=await enrichPlayerPhotos(normalized,previous,{fetcher});
    const snapshot=await enrichPlayerProfiles(photographed,previous,{fetcher,now});
    await env.FIXTURES.put('team_snapshot',JSON.stringify(snapshot));
    await env.FIXTURES.put('team_meta',JSON.stringify({lastAttemptAt:at,lastSuccessAt:at,failures:0}));
    return {updated:snapshot.squad.length};
  } catch(error) {
    await env.FIXTURES.put('team_meta',JSON.stringify({...meta,lastAttemptAt:at,failures:(meta.failures||0)+1,lastError:error.message}));
    return {error:error.message};
  }
}
