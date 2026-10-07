import test from 'node:test';
import assert from 'node:assert/strict';
import {CURATED_STADIUMS,safeStadium,stadiumArticle} from '../public/stadiums.js';
import {HOME_PHOTOS,nextHomePhoto,homePhoto} from '../public/home-photos.js';
import {refreshStadiums,stadiumResponse} from '../worker/stadiums.js';
import {articlePhotos} from '../worker/photos.js';
import {sampleSnapshot} from '../dev/sample.js';
import {handleRequest} from '../worker/index.js';
class KV{constructor(){this.store=new Map()}async get(k,t){const v=this.store.get(k);return v==null?null:t==='json'?JSON.parse(v):v}async put(k,v){this.store.set(k,v)}}
const now=Date.parse('2026-10-07T12:00:00Z');
const imageInfo={thumburl:CURATED_STADIUMS[524].photo.url,descriptionurl:CURATED_STADIUMS[524].photo.source,extmetadata:{Artist:{value:'Sample photographer'},LicenseShortName:{value:'CC BY-SA 4.0'}}};
test('home photo collection wraps through nine assets without an invalid image path',()=>{
 assert.equal(HOME_PHOTOS.length,9);assert.equal(nextHomePhoto(8),0);assert.equal(nextHomePhoto(0),1);assert.equal(homePhoto(-1),HOME_PHOTOS[0]);
 assert.ok(HOME_PHOTOS.every(p=>/^\/assets\/home\/camp-nou-\d\.webp$/.test(p.url)));
 assert.equal(new Set(HOME_PHOTOS.map(p=>p.url)).size,9);
});
test('stadium images require their source and licence, and aliases reject query injection',()=>{
 assert.ok(safeStadium(CURATED_STADIUMS[524]));
 assert.equal(safeStadium({...CURATED_STADIUMS[524],photo:{...CURATED_STADIUMS[524].photo,url:'https://example.com/photo.jpg'}}),null);
 assert.equal(stadiumArticle('Spotify Camp Nou'),'Camp Nou');assert.equal(stadiumArticle('Estadio Mestalla'),'Mestalla Stadium');
 assert.equal(stadiumArticle('stadium|unrelated page'),null);
});
test('stadium Wikipedia lookups reject unrelated articles rather than displaying a wrong building',async()=>{
 const fetcher=async()=>Response.json({query:{pages:[{title:'Unknown venue',description:'A historic monastery',pageimage:'Some.jpg',thumbnail:{source:CURATED_STADIUMS[524].photo.url}}]}});
 assert.equal((await articlePhotos(['Unknown venue'],{fetcher,width:1280,stadiumOnly:true})).size,0);
});
test('stadium warming is bounded, cached daily, and preserves a saved photograph on failure',async()=>{
 const env={FIXTURES:new KV(),FOOTBALL_DATA_TOKEN:'test'},snapshot=sampleSnapshot(now);
 await env.FIXTURES.put('snapshot',JSON.stringify({...snapshot,demo:false}));
 let teamCalls=0;
 const fetcher=async url=>{if(url.startsWith('https://api.football-data.org')){teamCalls++;const id=Number(/teams\/(\d+)/.exec(url)[1]);return Response.json({id,venue:id===81?'Spotify Camp Nou':'Parc des Princes'});}const title=new URL(url).searchParams.get('titles');return Response.json({query:{pages:[{title,imageinfo:[imageInfo]}]}});};
 assert.deepEqual(await refreshStadiums(env,{now,fetcher}),{attempted:2,updated:2});assert.equal(teamCalls,2);
 await env.FIXTURES.put('snapshot',JSON.stringify({...snapshot,demo:false,fixtures:snapshot.fixtures.filter(f=>[81,524].includes(f.homeTeam.id))}));
 assert.deepEqual(await refreshStadiums(env,{now:now+7200000,fetcher}),{attempted:0,updated:0});assert.equal(teamCalls,2);
 await env.FIXTURES.put('snapshot',JSON.stringify({...snapshot,demo:false}));
 assert.equal((await refreshStadiums(env,{now:now+7200000,fetcher})).attempted,2); // warm at most two remaining opponents
 const saved=await env.FIXTURES.get('stadiums','json');
 assert.deepEqual(await refreshStadiums(env,{now:now+86400000,fetcher:async()=>new Response('',{status:403})}),{attempted:2,updated:0});
 assert.deepEqual(await env.FIXTURES.get('stadiums','json'),saved);
});
test('stadium routes are read-only and unknown opponents do not inherit Barcelona artwork',async()=>{
 const request=new Request('https://example.com/api/stadiums'),env={FIXTURES:new KV()};
 const payload=await (await handleRequest(request,env)).json();assert.ok(payload.stadiums[524]);assert.equal(payload.stadiums[999999],undefined);
 assert.equal(await (await stadiumResponse(new Request(request.url,{method:'HEAD'}),env)).text(),'');
 assert.equal((await handleRequest(new Request(request.url,{method:'POST'}),env)).status,405);
});
