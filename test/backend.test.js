import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../worker/index.js';
import { refresh, refreshInterval } from '../worker/refresh.js';
import { sampleSnapshot } from '../dev/sample.js';
import { upcoming, currentMatch, stateLabel, countdown } from '../public/state.js';
class KV {
  constructor(initial={}) { this.items=new Map(Object.entries(initial).map(([key,value])=>[key,JSON.stringify(value)])); }
  async get(key,type) { const value=this.items.get(key);return value==null?null:type==='json'?JSON.parse(value):value; }
  async put(key,value) { this.items.set(key,value); }
}
const now=Date.parse('2026-10-07T12:00:00Z');
test('live fixture reads use authoritative scheduler state without a stale KV edge copy',async()=>{
 const snapshot={...sampleSnapshot(now),demo:false,liveCheckedAt:new Date(now).toISOString()};snapshot.fixtures[0].status='IN_PLAY';snapshot.fixtures[0].score={home:2,away:1};
 const env={SITE_ORIGIN:'https://example.test',FIXTURES:{get:async()=>{throw new Error('Must not use stale edge cache');}},MATCH_SCHEDULER:{getByName:name=>{assert.equal(name,'barca-matchday');return {fetch:async url=>{assert.equal(url,'https://scheduler/internal/fixtures');return Response.json({snapshot,meta:{},schedule:{alarmAt:new Date(now+60000).toISOString(),nextUpdateAt:new Date(now+60000).toISOString()}});}};}}};
 const response=await handleRequest(new Request('https://example.test/api/fixtures'),env),data=await response.json();
 assert.equal(response.status,200);assert.equal(data.fixtures[0].status,'IN_PLAY');assert.equal(data.fixtures[0].score.home,2);assert.equal(data.checkedAt,snapshot.liveCheckedAt);assert.equal(data.nextRefreshAt,new Date(now+60000).toISOString());
});
test('cold start and demo cannot publish misleading calendar fixtures', async () => {
  const env={FIXTURES:new KV()};
  assert.equal((await handleRequest(new Request('https://example.test/api/fixtures'),env)).status,503);
  env.FIXTURES=new KV({snapshot:sampleSnapshot(now)});
  assert.equal((await handleRequest(new Request('https://example.test/calendar/barca.ics'),env)).status,503);
  const payload=await (await handleRequest(new Request('https://example.test/api/fixtures'),env)).json();
  assert.equal(payload.calendarReady,false);
  assert.equal(payload.demo,true);
});
test('API and calendar read the snapshot; neither performs a provider refresh', async () => {
  const snapshot=sampleSnapshot(Date.now());snapshot.demo=false;
  const env={FIXTURES:new KV({snapshot}),FOOTBALL_DATA_TOKEN:'unit-test-value'};
  const payload=await (await handleRequest(new Request('https://example.test/api/fixtures'),env)).json();
  assert.equal(payload.calendarUrl,'https://example.test/calendar/barca.ics');
  assert.equal(payload.calendarReady,true);
  assert.equal(await env.FIXTURES.get('meta','json'),null);
  assert.equal((await handleRequest(new Request('https://example.test/calendar/barca.ics?competition=bad'),env)).status,400);
  const pending=await handleRequest(new Request('https://example.test/calendar/match/fd-104.ics'),env);
  assert.equal(pending.status,200);
  assert.match(await pending.text(),/DTSTART;VALUE=DATE:/);
  assert.equal((await handleRequest(new Request('https://example.test/calendar/barca.ics?competition=CL'),env)).status,200);
  assert.equal((await handleRequest(new Request('http://localhost/api/fixtures'),env)).status,200);
  assert.equal((await (await handleRequest(new Request('http://localhost/api/fixtures'),env)).json()).calendarUrl,null);
});
test('provider failure preserves the last good snapshot and retry spacing', async () => {
  const saved=sampleSnapshot(now);saved.demo=false;
  const env={FIXTURES:new KV({snapshot:saved}),FOOTBALL_DATA_TOKEN:'unit-test-value'};
  let calls=0;
  const fetcher=async()=>{calls++;return new Response('Unavailable',{status:429});};
  assert.match((await refresh(env,{now,fetcher})).error,/429/);
  assert.deepEqual(await env.FIXTURES.get('snapshot','json'),saved);
  assert.equal((await env.FIXTURES.get('meta','json')).failures,1);
  assert.equal((await refresh(env,{now:now+60000,fetcher})).skipped,'attempted-recently');
  assert.equal(calls,1);
});
test('successful refresh normalizes data, backs up the snapshot and clears failures', async () => {
  const env={FIXTURES:new KV({snapshot:{schemaVersion:1,checkedAt:new Date(now-86400000).toISOString(),fixtures:[]},meta:{failures:2}}),FOOTBALL_DATA_TOKEN:'unit-test-value'};
  let request;
  const match={id:9,status:'TIMED',utcDate:'2026-10-09T18:00:00Z',competition:{code:'PD'},homeTeam:{id:81,name:'Barcelona'},awayTeam:{id:82,name:'Getafe'}};
  const result=await refresh(env,{now,fetcher:async(url,options)=>{request={url,options};return Response.json({matches:[match]});}});
  assert.equal(result.updated,1);
  assert.match(request.url,/teams\/81\/matches\?dateFrom=2026-09-07&dateTo=2027-08-03&limit=500/);
  assert.equal(request.options.headers['X-Auth-Token'],'unit-test-value');
  assert.equal((await env.FIXTURES.get('snapshot','json')).demo,false);
  assert.equal((await env.FIXTURES.get('snapshot_prev','json')).fixtures.length,0);
  assert.equal((await env.FIXTURES.get('meta','json')).failures,0);
  assert.equal((await refresh(env,{now:now+7200000})).skipped,'not-due');
});
test('day-of refresh speeds up; elapsed kickoff never fabricates live or finished', () => {
  const sample=sampleSnapshot(now);
  assert.equal(refreshInterval(sample,now),6*3600000);
  const next=upcoming(sample.fixtures,now)[0];
  const close=Date.parse(next.kickoffUtc)-3600000;
  assert.equal(refreshInterval(sample,close),3600000);
  assert.equal(countdown(next,close),'1h 0m');
  assert.equal(stateLabel(next,close+7200000),'Scheduled start passed · status unavailable');
  assert.equal(currentMatch([next],close+7200000),next);
  const live={...next,status:'IN_PLAY'};
  assert.equal(countdown(live,close),null);
  assert.match(stateLabel(live,close),/delayed status/);
  assert.equal(upcoming([{...next,status:'CANCELLED'}],now).length,0);
});
