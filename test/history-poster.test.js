import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHistory,refreshHistory,historyResponse} from '../worker/history.js';
import {recentMeetings,meetingOutcome} from '../public/history.js';
import {nearbyFixtures,posterState,mainPosterFixture} from '../public/poster.js';
import {currentMatch} from '../public/state.js';
import {sampleSnapshot} from '../dev/sample.js';
import {handleRequest} from '../worker/index.js';
const now=Date.parse('2026-10-07T12:00:00Z'),at=new Date(now).toISOString();
const snapshot=sampleSnapshot(now),match=snapshot.fixtures.find(f=>f.id==='fd-101');
test('final poster advances exactly ten minutes after confirmation, retaining live priority and result access',()=>{
 const final={...match,id:'final',status:'FINISHED',score:{home:2,away:1},kickoffUtc:new Date(now-2*3600000).toISOString(),summaryFinalAt:at};
 const next={...match,id:'next',status:'TIMED',kickoffUtc:new Date(now+86400000).toISOString()};
 const fixtures=[final,next];
 assert.equal(mainPosterFixture(fixtures,null,now+599999).id,'final');
 assert.equal(mainPosterFixture(fixtures,null,now+600000).id,'next');
 assert.equal(nearbyFixtures(fixtures,next,now+600000)[0].fixture.id,'final');
 assert.equal(mainPosterFixture([final],null,now+600000).id,'final');
 assert.equal(mainPosterFixture([{...final,summaryFinalAt:null},next],at,now+599999).id,'final');
 assert.equal(mainPosterFixture([{...final,summaryFinalAt:null},next],at,now+600000).id,'next');
 assert.equal(mainPosterFixture([{...next,status:'IN_PLAY'},final],null,now+1).id,'next');
});
const raw=(id=900,home=true)=>({id,utcDate:'2026-03-05T18:30:00Z',status:'FINISHED',homeTeam:home?match.homeTeam:match.awayTeam,awayTeam:home?match.awayTeam:match.homeTeam,competition:{code:'PD',name:'La Liga'},score:{fullTime:{home:2,away:1},duration:'REGULAR'}});
class KV {constructor(){this.store=new Map()}async get(k,t){const v=this.store.get(k);return v==null?null:t==='json'?JSON.parse(v):v}async put(k,v){this.store.set(k,v)}}
test('historical meetings reject a different opponent, duplicate IDs and corrupt scores',()=>{
 assert.equal(normalizeHistory({matches:[raw()]},match,at).fixtures[0].homeTeam.name,'FC Barcelona');
 assert.throws(()=>normalizeHistory({matches:[{...raw(),awayTeam:{id:95,name:'Valencia CF'}}]},match,at),/Malformed/);
 assert.throws(()=>normalizeHistory({matches:[raw(),raw()]},match,at),/Duplicate/);
 assert.throws(()=>normalizeHistory({matches:[{...raw(),score:{fullTime:{home:2,away:null}}}]},match,at),/Malformed/);
 assert.throws(()=>normalizeHistory({errors:[{}],matches:[]},match,at),/Invalid/);
});
test('recent meetings exclude the selected match, future scores, unplayed games and other teams',()=>{
 const past=normalizeHistory({matches:[raw()]},match,at).fixtures[0];
 const records=[past,past,{...past,id:'future',kickoffUtc:'2026-10-09T12:00:00Z'},{...past,id:match.id},{...past,id:'unplayed',status:'TIMED'},{...past,id:'other',awayTeam:{id:95}}];
 assert.deepEqual(recentMeetings(records,match,now).map(f=>f.id),['fd-900']);
 const selectedOld={...match,kickoffUtc:'2026-01-01T12:00:00Z'};
 assert.equal(recentMeetings(records,selectedOld,now).length,0);
});
test('head-to-head outcomes use Barça’s away perspective and confirmed penalties',()=>{
 const game=normalizeHistory({matches:[raw(900,false)]},match,at).fixtures[0];
 assert.equal(meetingOutcome(game),'L');
 assert.equal(meetingOutcome({...game,score:{home:1,away:1,duration:'PENALTY_SHOOTOUT',penalties:{home:3,away:4}}}),'W');
});
test('history refresh is capped, daily cached and preserves saved results after a failure',async()=>{
 const env={FIXTURES:new KV(),FOOTBALL_DATA_TOKEN:'test'};
 await env.FIXTURES.put('snapshot',JSON.stringify({...snapshot,demo:false}));
 let calls=0;
 const fetcher=async url=>{calls++;const id='fd-'+/matches\/(\d+)/.exec(url)[1];const f=snapshot.fixtures.find(f=>f.id===id);return Response.json({matches:[{...raw(900+calls),homeTeam:f.homeTeam,awayTeam:f.awayTeam}]});};
 assert.deepEqual(await refreshHistory(env,{now,fetcher}),{attempted:2,updated:2});
 assert.equal(calls,2);
 const saved=await env.FIXTURES.get('history_82','json');
 await env.FIXTURES.put('snapshot',JSON.stringify({demo:false,fixtures:[match]}));
 assert.equal((await refreshHistory(env,{now:now+7200000,fetcher})).attempted,0);
 assert.deepEqual(await refreshHistory(env,{now:now+86400000,fetcher:async()=>new Response('',{status:403})}),{attempted:1,updated:0});
 assert.deepEqual(await env.FIXTURES.get('history_82','json'),saved);
 assert.equal((await refreshHistory(env,{now:now+90000000,fetcher})).attempted,0);
});
test('history API reads shared cached data, falls back honestly and never calls the provider',async()=>{
 const env={FIXTURES:new KV()};await env.FIXTURES.put('snapshot',JSON.stringify({...snapshot,demo:false}));
 const request=new Request('https://example.com/api/head-to-head?match=fd-101');
 const fallback=await (await handleRequest(request,env)).json();assert.equal(fallback.limited,true);assert.equal(fallback.fixtures.length,1);
 await env.FIXTURES.put('history_82',JSON.stringify(normalizeHistory({matches:[raw()]},match,at)));
 const payload=await (await historyResponse(request,env)).json();assert.equal(payload.limited,false);assert.equal(payload.fixtures.length,2);
 assert.equal(await (await handleRequest(new Request(request.url,{method:'HEAD'}),env)).text(),'');
 assert.equal((await handleRequest(new Request('https://example.com/api/head-to-head?match=unknown'),env)).status,400);
 assert.equal((await handleRequest(new Request('https://example.com/api/head-to-head?match=fd-999'),env)).status,404);
});
test('poster distinguishes matchday, postponed and delayed provider states without guessing live',()=>{
 assert.equal(posterState(match,now,'Europe/London').title,'Next tracked match');
 assert.equal(posterState({...match,kickoffUtc:at},now,'Europe/London').title,'Matchday');
 assert.equal(posterState({...match,status:'POSTPONED',timeConfirmed:false},now).title,'Postponed');
 assert.equal(posterState({...match,status:'IN_PLAY'},now).live,true);
 assert.equal(posterState({...match,kickoffUtc:at},now).live,false);
 assert.equal(currentMatch([{...match,kickoffUtc:new Date(now-3*3600000).toISOString()}],now),undefined);
 assert.equal(posterState({...match,kickoffUtc:'2026-10-10T21:30:00Z'},now,'Europe/Madrid').tone,'night');
});
test('nearby fixture strip omits empty columns and does not repeat its hero',()=>{
 const nearby=nearbyFixtures(snapshot.fixtures,match,now);
 assert.deepEqual(nearby.map(c=>c.label),['Previous','Then','After']);
 assert.ok(nearby.every(c=>c.fixture.id!==match.id));
 assert.deepEqual(nearbyFixtures([match],match,now),[]);
 assert.equal(nearbyFixtures(snapshot.fixtures.filter(f=>['fd-101','fd-102'].includes(f.id)),match,now).length,1);
});
