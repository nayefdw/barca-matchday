import test from 'node:test';
import assert from 'node:assert/strict';
import {playerArticle} from '../public/photos.js';
import {playerPhotos} from '../worker/photos.js';
import {matchVenue,CURATED_STADIUMS} from '../public/stadiums.js';
import {stadiumResponse,refreshStadiums} from '../worker/stadiums.js';
import {historyResponse,refreshHistory} from '../worker/history.js';
import {archivedMeetings,mergeHistory} from '../worker/history-archive.js';
class KV{constructor(){this.store=new Map()}async get(k,t){const v=this.store.get(k);return v==null?null:t==='json'?JSON.parse(v):v}async put(k,v){this.store.set(k,v)}}
const at='2026-10-07T12:00:00Z',now=Date.parse(at);
const match=(rival,id='fd-123')=>({id,homeTeam:{id:81,name:'FC Barcelona'},awayTeam:{id:rival,name:'Opponent'},kickoffUtc:'2026-11-01T18:00:00Z',status:'TIMED',competition:'CL',score:{home:null,away:null}});
const photo='https://upload.wikimedia.org/wikipedia/commons/a/aa/Portrait.jpg',credit='https://commons.wikimedia.org/wiki/File:Portrait.jpg';
const info={url:photo,thumburl:photo,descriptionurl:credit,extmetadata:{Artist:{value:'Photographer'},LicenseShortName:{value:'CC BY-SA 4.0'}}};
test('provider roster aliases resolve the exact football biographies, including disambiguations',()=>{
 assert.equal(playerArticle('Pablo Gavira'),'Gavi (footballer)');assert.equal(playerArticle('Álex Balde'),'Alejandro Balde');
 assert.equal(playerArticle('Anthony Gordon'),'Anthony Gordon (footballer)');assert.equal(playerArticle('Eric García'),'Eric García (footballer, born 2001)');assert.equal(playerArticle('Gerard Martín'),'Gerard Martín (footballer)');
});
test('a goalkeeper description is accepted while a disambiguation thumbnail is rejected',async()=>{
 const fetcher=async url=>Response.json(url.startsWith('https://en.wikipedia.org')?{query:{pages:[{title:'Dominik Livaković',description:'Croatian goalkeeper (born 1995)',pageimage:'Portrait.jpg',thumbnail:{source:photo}},{title:'Anthony Gordon (footballer)',pageimage:'Wrong.jpg',thumbnail:{source:photo},pageprops:{disambiguation:''}}]}}:{query:{pages:[{title:'File:Portrait.jpg',imageinfo:[info]}]}});
 const photos=await playerPhotos([{name:'Dominik Livaković'},{name:'Anthony Gordon'}],{fetcher});assert.equal(photos.size,1);assert.equal(photos.get('Dominik Livaković').source,credit);
});
test('Wikidata P18 restores a licensed portrait through the exact biography entity',async()=>{
 const requests=[];const fetcher=async url=>{requests.push(url);return Response.json(url.startsWith('https://en.wikipedia.org')?{query:{pages:[{title:'Pedri',description:'Spanish footballer',pageprops:{wikibase_item:'Q123'}}]}}:url.startsWith('https://www.wikidata.org')?{entities:{Q123:{claims:{P18:[{rank:'normal',mainsnak:{datavalue:{value:'Portrait.jpg'}}}]}}}}:{query:{pages:[{title:'File:Portrait.jpg',imageinfo:[info]}]}});};
 const photos=await playerPhotos([{name:'Pedri'}],{fetcher});assert.equal(photos.get('Pedri').url,photo);assert.equal(photos.get('Pedri').license,'CC BY-SA 4.0');assert.ok(requests[1].includes('ids=Q123'));
});
test('club ground fallback preserves explicit match venues and never treats artwork as confirmation',()=>{
 const selected=match(65),venue={name:'Spotify Camp Nou',checkedAt:at};
 assert.equal(matchVenue(selected,CURATED_STADIUMS),null);assert.deepEqual(matchVenue(selected,{81:venue}),{name:'Spotify Camp Nou',confirmed:false,source:'club',note:'Club home ground · match venue not supplied'});
 assert.deepEqual(matchVenue({...selected,venue:'Neutral stadium'},{81:venue}),{name:'Neutral stadium',confirmed:true,source:'match'});
});
test('club venue data is saved even if a stadium photograph is unavailable',async()=>{
 const env={FIXTURES:new KV(),FOOTBALL_DATA_TOKEN:'test'};await env.FIXTURES.put('snapshot',JSON.stringify({demo:false,fixtures:[match(65)]}));
 await refreshStadiums(env,{now,fetcher:async url=>url.startsWith('https://api.football-data.org')?Response.json({id:81,venue:'Spotify Camp Nou'}):Response.json({query:{pages:[]}})});
 const response=await(await stadiumResponse(new Request('https://example.com/api/stadiums'),env)).json();assert.equal(response.venues[81].name,'Spotify Camp Nou');assert.equal(response.venues[81].source,'football-data.org');
});
test('verified archive provides historical CL rival scores despite a successfully empty free response',async()=>{
 const env={FIXTURES:new KV()},selected=match(610);await env.FIXTURES.put('snapshot',JSON.stringify({demo:false,checkedAt:at,fixtures:[selected]}));await env.FIXTURES.put('history_610',JSON.stringify({checkedAt:at,fixtures:[]}));
 const response=await(await historyResponse(new Request('https://example.com/api/head-to-head?match=fd-123'),env)).json();assert.equal(response.fixtures.length,5);assert.equal(response.archiveUsed,true);assert.equal(response.fixtures[0].competition,'EL');assert.deepEqual(response.fixtures[0].score,{home:1,away:2,duration:'REGULAR',penalties:null});assert.ok(response.sources.every(source=>source.url.startsWith('https://www.uefa.com/')));
});
test('archive merging prefers provider results for the same game and does not invent unknown rivals',()=>{
 const archive=archivedMeetings(match(65)),existing={...archive[0],id:'fd-1000',dateOnly:false,kickoffUtc:'2022-08-24T19:30:00Z'};
 const merged=mergeHistory([existing],archive);assert.equal(merged.filter(f=>f.kickoffUtc.startsWith('2022-08-24')).length,1);assert.equal(merged[0].id,'fd-1000');assert.equal(archivedMeetings(match(10233)).length,0);
 const villa=archivedMeetings(match(58));assert.equal(villa.length,4);assert.equal(villa[0].kickoffUtc,'1983-01-26T00:00:00Z');assert.equal(villa[0].score.duration,'EXTRA_TIME');
});
test('history warming reserves a bounded slot for a later Champions League rival',async()=>{
 const env={FIXTURES:new KV(),FOOTBALL_DATA_TOKEN:'test'},league={...match(82,'fd-1'),competition:'PD',kickoffUtc:'2026-10-08T18:00:00Z'},another={...match(90,'fd-2'),competition:'PD',kickoffUtc:'2026-10-09T18:00:00Z'},european={...match(65,'fd-3'),kickoffUtc:'2026-12-08T18:00:00Z'};
 await env.FIXTURES.put('snapshot',JSON.stringify({demo:false,fixtures:[league,another,european]}));const urls=[];
 assert.deepEqual(await refreshHistory(env,{now,fetcher:async url=>{urls.push(url);return Response.json({matches:[]});}}),{attempted:2,updated:2});assert.ok(urls.some(url=>url.includes('/matches/3/')));assert.ok(urls.some(url=>url.includes('/matches/1/')));
});
