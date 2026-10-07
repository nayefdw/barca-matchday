import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTeam, refreshTeam } from '../worker/team.js';
import { trackedStats } from '../public/insights.js';
const payload={id:81,name:'FC Barcelona',crest:'https://crests.football-data.org/81.svg',coach:{name:'Sample coach'},squad:[{id:1,name:'Sample player',position:'Offence',shirtNumber:null}]};
class KV{constructor(){this.store=new Map()}async get(k,t){const v=this.store.get(k);return v==null?null:t==='json'?JSON.parse(v):v}async put(k,v){this.store.set(k,v)}}
test('squad validation keeps unavailable shirt numbers unknown',()=>{
 assert.equal(normalizeTeam(payload,'2026-10-07T12:00:00Z').squad[0].shirtNumber,null);
 assert.throws(()=>normalizeTeam({...payload,id:82},'2026-10-07T12:00:00Z'),/Invalid/);
 assert.throws(()=>normalizeTeam({...payload,squad:[payload.squad[0],payload.squad[0]]},'2026-10-07T12:00:00Z'),/Duplicate/);
});
test('team refresh runs daily, while failures preserve the saved squad',async()=>{
 const env={FIXTURES:new KV(),FOOTBALL_DATA_TOKEN:'unit-test'}, now=Date.parse('2026-10-07T12:00:00Z');
 assert.equal((await refreshTeam(env,{now,fetcher:async()=>Response.json(payload)})).updated,1);
 assert.equal((await refreshTeam(env,{now:now+7200000})).skipped,'not-due');
 const saved=await env.FIXTURES.get('team_snapshot','json');
 assert.match((await refreshTeam(env,{now:now+86400000,fetcher:async()=>new Response('',{status:403})})).error,/403/);
 assert.deepEqual(await env.FIXTURES.get('team_snapshot','json'),saved);
});
test('stats exclude unplayed matches and count Barcelona’s away goals correctly',()=>{
 const team={id:81}, rival={id:82};
 const games=[{status:'FINISHED',homeTeam:team,awayTeam:rival,kickoffUtc:'2026-10-01T12:00:00Z',score:{home:3,away:1}},{status:'FINISHED',homeTeam:rival,awayTeam:team,kickoffUtc:'2026-10-02T12:00:00Z',score:{home:2,away:0}},{status:'TIMED',homeTeam:team,awayTeam:rival,kickoffUtc:'2026-10-10T12:00:00Z',score:{home:null,away:null}}];
 assert.deepEqual(trackedStats(games),{played:2,wins:1,draws:0,losses:1,goalsFor:3,goalsAgainst:3,home:1,away:1});
});
