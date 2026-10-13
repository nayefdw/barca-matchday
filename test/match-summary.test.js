import test from 'node:test';
import assert from 'node:assert/strict';
import {matchOfficialFixture,normalizeOfficialSummary,loadMatchSummary,applyMatchSummary,summaryResponse} from '../worker/match-summary.js';
import {matchSummaryPanel} from '../public/match-summary.js';
import {normalizeMatches} from '../worker/normalize.js';
const now=Date.parse('2026-10-13T21:00:00Z'),start=now-2*3600000;
const fixture={id:'fd-1',competition:'PD',kickoffUtc:new Date(start).toISOString(),timeConfirmed:true,status:'FINISHED',homeTeam:{id:81,name:'FC Barcelona'},awayTeam:{id:82,name:'Getafe CF'},score:{home:3,away:0}};
const record={id:1001,gameweek:{compSeason:{competition:{id:21}}},kickoff:{millis:start},status:'C',phase:'F',teams:[{team:{id:49,name:'FC Barcelona'},score:3},{team:{id:44,name:'Getafe'},score:0}],teamLists:[{lineup:[{id:7,name:{display:'Home Player'}}],substitutes:[]},{lineup:[{id:8,name:{display:'Away Player'}}],substitutes:[]}],clock:{label:"90+4'00"},events:[{type:'G',personId:7,teamId:49,clock:{label:"12'00",secs:720}},{type:'P',personId:7,teamId:49,clock:{label:"45+2'00",secs:2820}},{type:'O',personId:8,teamId:49,clock:{label:"78'00",secs:4680}}]};
const stats={entity:record,data:{49:{M:[{name:'possession_percentage',value:65},{name:'total_scoring_att',value:20},{name:'ontarget_scoring_att',value:9},{name:'won_corners',value:0},{name:'total_pass',value:500},{name:'accurate_pass',value:450}]},44:{M:[{name:'possession_percentage',value:35},{name:'total_scoring_att',value:5},{name:'ontarget_scoring_att',value:1}]}}};
class KV{constructor(){this.data=new Map();}async get(key,type){const value=this.data.get(key);return value==null?null:type==='json'?JSON.parse(value):value;}async put(key,value){this.data.set(key,value);}}
test('a delayed fixture-provider update cannot turn the official final result back into a live match',()=>{
 const previous={...fixture,source:'FC Barcelona',sourceUpdatedAt:new Date(now).toISOString(),summaryFinalAt:new Date(now).toISOString(),venue:'Confirmed ground'};
 for(const status of ['TIMED','IN_PLAY','PAUSED']){
  const raw={id:1,competition:{code:'PD'},utcDate:fixture.kickoffUtc,status,homeTeam:fixture.homeTeam,awayTeam:fixture.awayTeam,score:{fullTime:{home:0,away:0}}};
  const updated=normalizeMatches({matches:[raw]},{fixtures:[previous]},new Date(now+60000).toISOString())[0];
  assert.equal(updated.status,'FINISHED');assert.equal(updated.score.home,3);assert.equal(updated.venue,'Confirmed ground');assert.equal(updated.summaryFinalAt,previous.summaryFinalAt);
 }
});
test('official identity matching rejects wrong opponents, sides, dates, competitions and ambiguity',()=>{
 assert.equal(matchOfficialFixture(fixture,[record]),record);
 for(const changed of [{...record,kickoff:{millis:start+86400000}},{...record,teams:[...record.teams].reverse()},{...record,gameweek:{compSeason:{competition:{id:2}}}},{...record,teams:[record.teams[0],{team:{id:45,name:'Valencia'}}]}])assert.equal(matchOfficialFixture(fixture,[changed]),null);
 assert.equal(matchOfficialFixture(fixture,[record,{...record,id:1002}]),null);
});
test('verified summary retains zero statistics, unknown values, added-time goals and own-goal attribution',()=>{
 const summary=normalizeOfficialSummary(fixture,record,stats,now);
 assert.equal(summary.score.home,3);assert.equal(summary.status,'FINISHED');assert.equal(summary.clock,'90+4');
 assert.equal(summary.scorers[1].type,'penalty');assert.equal(summary.scorers[1].minute,"45+2'");
 assert.equal(summary.scorers[2].type,'own-goal');assert.equal(summary.scorers[2].team,'home');assert.equal(summary.scorers[2].name,'Away Player');
 assert.deepEqual(summary.stats.find(row=>row.key==='corners'),{key:'corners',label:'Corners',unit:'',home:0,away:null});
 assert.equal(summary.stats.find(row=>row.key==='passAccuracy').home,90);
 assert.equal(normalizeOfficialSummary(fixture,record,{...stats,entity:{...record,id:999}},now).stats.length,0);
});
test('summary overlays preserve identity, reject missing kickoff and cannot downgrade a finished match',()=>{
 const summary=normalizeOfficialSummary(fixture,record,stats,now),updated=applyMatchSummary(fixture,summary,now);
 assert.equal(updated.id,fixture.id);assert.equal(updated.kickoffUtc,fixture.kickoffUtc);assert.equal(updated.source,'FC Barcelona');
 assert.equal(applyMatchSummary(fixture,{...summary,status:'IN_PLAY'},now),fixture);
 assert.equal(applyMatchSummary(fixture,{...summary,kickoffUtc:undefined},now),fixture);
});
test('finished summary is cached and private/untracked identifiers cannot fetch source data',async()=>{
 const env={FIXTURES:new KV()};let calls=0;
 const fetcher=async url=>{calls++;return Response.json(url.includes('/stats/')?stats:url.includes('?teams=')?{content:[record]}:record);};
 const loaded=await loadMatchSummary(env,fixture,{now,fetcher});assert.equal(calls,3);assert.equal(loaded.scorers.length,3);
 await loadMatchSummary(env,fixture,{now:now+60000,fetcher});assert.equal(calls,3);
 await env.FIXTURES.put('snapshot',JSON.stringify({demo:false,fixtures:[fixture]}));
 assert.equal((await summaryResponse(new Request('https://app.example/api/match-summary?match=../../secret'),env,{now,fetcher})).status,400);
 assert.equal((await summaryResponse(new Request('https://app.example/api/match-summary?match=fd-999'),env,{now,fetcher})).status,404);assert.equal(calls,3);
});
test('source outage backs off and preserves a previously verified summary',async()=>{
 const env={FIXTURES:new KV()},saved=normalizeOfficialSummary(fixture,record,stats,now);await env.FIXTURES.put('match_summaries',JSON.stringify({[fixture.id]:saved}));
 let calls=0;const fetcher=async()=>{calls++;throw new Error('Offline');};
 const result=await loadMatchSummary(env,fixture,{now:now+7*3600000,fetcher});assert.equal(result.stale,true);assert.equal(result.score.home,3);
 await loadMatchSummary(env,fixture,{now:now+7*3600000+60000,fetcher});assert.equal(calls,1);
});
test('summary presentation replaces history, escapes scorer content and never fabricates missing stats',()=>{
 const summary=normalizeOfficialSummary(fixture,record,stats,now);summary.scorers[0].name='<img src=x onerror=alert(1)>';
 const html=matchSummaryPanel(fixture,summary);assert.ok(html.includes('MATCH SUMMARY'));assert.ok(html.includes('Shots on target'));assert.ok(!html.includes('Recent meetings'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));
 const missing=matchSummaryPanel(fixture,null);assert.ok(missing.includes('Statistics are not available yet'));assert.ok(missing.includes('Scorer details are not available yet'));
});
test('a known final score appears immediately even while older live statistics are being replaced',()=>{
 const previous={...normalizeOfficialSummary(fixture,record,stats,now),status:'IN_PLAY',score:{home:1,away:0}};
 const html=matchSummaryPanel(fixture,previous,{loading:true});assert.ok(html.includes('Full time'));assert.ok(html.includes('aria-label="Score 3 to 0"'));assert.ok(!html.includes('LIVE MATCH'));
 const halfTime=matchSummaryPanel({...fixture,status:'PAUSED',sourceUpdatedAt:new Date(now+60000).toISOString()},previous,{loading:true});assert.ok(halfTime.includes('Half-time'));
});
