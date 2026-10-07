import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeStandings,refreshStandings} from '../worker/standings.js';
import {handleRequest} from '../worker/index.js';
import {sampleStandings} from '../dev/sample.js';
import {playerArticle,safePhoto,safePhotoCredit} from '../public/photos.js';
import {playerPhotos,enrichPlayerPhotos} from '../worker/photos.js';
class KV{constructor(){this.store=new Map()}async get(k,t){const v=this.store.get(k);return v==null?null:t==='json'?JSON.parse(v):v}async put(k,v){this.store.set(k,v)}}
const at='2026-10-07T12:00:00Z';
function provider(code){const sample=sampleStandings(code,Date.parse(at));return {competition:{code},standings:sample.tables.map(t=>({...t,type:'TOTAL',table:t.rows.map(r=>({...r,playedGames:r.played}))}))};}
test('standings retain official positions and points, select TOTAL and reject corrupt totals',()=>{
 const payload=provider('PD');payload.standings.push({...payload.standings[0],type:'HOME'});
 assert.equal(normalizeStandings(payload,'PD',at).tables.length,1);
 payload.standings[0].table[0].points=-2;assert.equal(normalizeStandings(payload,'PD',at).tables[0].rows[0].points,-2);
 payload.standings[0].table[0].playedGames=100;assert.throws(()=>normalizeStandings(payload,'PD',at),/totals/);
 assert.throws(()=>normalizeStandings(provider('PD'),'CL',at),/Invalid/);
});
test('standings refresh independently and failures preserve both saved tables; API is read-only',async()=>{
 const env={FIXTURES:new KV(),FOOTBALL_DATA_TOKEN:'unit-test'},now=Date.parse(at);let calls=0;
 await refreshStandings(env,{now,fetcher:async url=>{calls++;return Response.json(provider(url.includes('/PD/')?'PD':'CL'));}});
 const saved=await env.FIXTURES.get('standings_PD','json');assert.equal(calls,2);
 await refreshStandings(env,{now:now+3600000,fetcher:async()=>{throw new Error('Must not call')}});
 await refreshStandings(env,{now:now+6*3600000,fetcher:async()=>new Response('',{status:403})});
 assert.deepEqual(await env.FIXTURES.get('standings_PD','json'),saved);
 assert.equal((await handleRequest(new Request('https://test.invalid/api/standings?competition=PD'),env)).status,200);
 assert.equal((await handleRequest(new Request('https://test.invalid/api/standings?competition=bad'),env)).status,400);
});
test('standings preserve tied official ranks while rejecting duplicate clubs',()=>{
 const payload=provider('CL'),table=payload.standings[0].table;
 table[1].position=table[0].position;
 const rows=normalizeStandings(payload,'CL',at).tables[0].rows;
 assert.equal(rows[0].position,rows[1].position);
 assert.equal(rows.length,table.length);
 table.push({...table[0]});
 assert.throws(()=>normalizeStandings(payload,'CL',at),/Duplicate standings rows/);
});
test('player photo aliases are explicit, and URLs cannot escape Wikimedia',()=>{
 assert.equal(playerArticle('Pedro González López'),'Pedri');assert.equal(playerArticle('Unknown person'),null);
 assert.equal(safePhoto('https://evil.test/wikipedia/commons/a.jpg'),null);assert.equal(safePhoto('javascript:alert(1)'),null);
 assert.equal(safePhotoCredit('https://commons.wikimedia.org.evil.test/wiki/File:a.jpg'),null);
 assert.equal(safePhoto('https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a.jpg?utm_source=x'),'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a.jpg');
});
test('photo lookup handles file-name normalization, preserves required credit and falls back on failure',async()=>{
 const team={squad:[{id:1,name:'Pedri'}]};let calls=0;
 const fetcher=async()=>Response.json(++calls===1?{query:{pages:[{title:'Pedri',thumbnail:{source:'https://upload.wikimedia.org/wikipedia/commons/a/a/Pedri_photo.jpg'},pageimage:'Pedri_photo.jpg'}]}}:{query:{pages:[{title:'File:Pedri photo.jpg',imageinfo:[{descriptionurl:'https://commons.wikimedia.org/wiki/File:Pedri_photo.jpg',extmetadata:{Attribution:{value:'Photographer / Collection'},Artist:{value:'<a>Other</a>'},LicenseShortName:{value:'CC BY-SA 4.0'}}}]}]}});
 const photos=await playerPhotos(team.squad,{fetcher});assert.equal(photos.get('Pedri').author,'Photographer / Collection');
 const previous={squad:[{...team.squad[0],photo:photos.get('Pedri')}]};
 const result=await enrichPlayerPhotos(team,previous,{fetcher:async()=>{throw new Error('Offline')}});assert.deepEqual(result.squad[0].photo,previous.squad[0].photo);
});
