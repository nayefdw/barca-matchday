import {clubTeam} from '../public/teams.js';
import {enrichmentRetryWait} from './retry.js';
export const TABLE_COMPETITIONS={PD:'La Liga',CL:'Champions League'};
export function normalizeStandings(payload,competition,checkedAt){
 if(!TABLE_COMPETITIONS[competition]||payload.competition?.code!==competition||!Array.isArray(payload.standings))throw new Error('Invalid standings response');
 const tables=payload.standings.filter(s=>s.type==='TOTAL'&&Array.isArray(s.table)&&s.table.some(row=>row.team?.id===81)).map(s=>{
   if(s.table.length>64)throw new Error('Oversized standings table');
   const rows=s.table.map(r=>{
     if(!Number.isInteger(r.position)||r.position<1||!Number.isInteger(r.team?.id)||typeof r.team.name!=='string')throw new Error('Invalid standings row');
     const numbers={played:r.playedGames,won:r.won,draw:r.draw,lost:r.lost,points:r.points,goalsFor:r.goalsFor,goalsAgainst:r.goalsAgainst,goalDifference:r.goalDifference};
     if(Object.values(numbers).some(n=>!Number.isInteger(n))||[numbers.played,numbers.won,numbers.draw,numbers.lost,numbers.goalsFor,numbers.goalsAgainst].some(n=>n<0)||numbers.won+numbers.draw+numbers.lost!==numbers.played||numbers.goalsFor-numbers.goalsAgainst!==numbers.goalDifference)throw new Error('Invalid standings totals');
     return {position:r.position,team:clubTeam(r.team),...numbers};
   }).sort((a,b)=>a.position-b.position);
   // The provider can assign tied clubs the same official rank. Preserve it;
   // only a repeated club represents a duplicate row.
   if(new Set(rows.map(r=>r.team.id)).size!==rows.length)throw new Error('Duplicate standings rows');
   return {stage:typeof s.stage==='string'?s.stage:null,group:typeof s.group==='string'?s.group:null,rows};
 });
 if(!tables.length)throw new Error('No Barcelona standings available');
 return {schemaVersion:1,competition,name:TABLE_COMPETITIONS[competition],checkedAt,demo:false,season:typeof payload.season?.startDate==='string'?payload.season.startDate.slice(0,4)+(payload.season.endDate?' / '+payload.season.endDate.slice(2,4):''):null,tables};
}
export async function refreshStandings(env,{now=Date.now(),fetcher=fetch}={}){
 if(!env.FIXTURES||!env.FOOTBALL_DATA_TOKEN)return {skipped:'not-configured'};
 const results={};
 for(const code of Object.keys(TABLE_COMPETITIONS)){
   const key='standings_'+code,meta=await env.FIXTURES.get(key+'_meta','json')||{};
   if(meta.lastAttemptAt&&now-Date.parse(meta.lastAttemptAt)<enrichmentRetryWait(meta)||meta.lastSuccessAt&&now-Date.parse(meta.lastSuccessAt)<6*3600000){results[code]={skipped:'not-due'};continue;}
   const at=new Date(now).toISOString();
   try{const response=await fetcher(`https://api.football-data.org/v4/competitions/${code}/standings`,{headers:{'X-Auth-Token':env.FOOTBALL_DATA_TOKEN},signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error(`Standings provider returned ${response.status}`);const snapshot=normalizeStandings(await response.json(),code,at);await env.FIXTURES.put(key,JSON.stringify(snapshot));await env.FIXTURES.put(key+'_meta',JSON.stringify({lastAttemptAt:at,lastSuccessAt:at,failures:0}));results[code]={updated:true};}
   catch(error){await env.FIXTURES.put(key+'_meta',JSON.stringify({...meta,lastAttemptAt:at,failures:(meta.failures||0)+1,lastError:error.message}));results[code]={error:error.message};}
 }
 return results;
}
