import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
const shell=source.match(/const (?:SHELL|CACHE)\s*=\s*["']([^"']+)/)[1];
const origin='https://startup.test';
function harness(network=()=>new Response('fresh')){
 const stores=new Map(),listeners={},fetches=[],installed=[];let claimed=false,skipped=false;
 const address=value=>new URL(typeof value==='string'?value:value.url,origin+'/').href;
 const cache=name=>{
  if(!stores.has(name))stores.set(name,new Map());const entries=stores.get(name);
  return {async match(request,options={}){const wanted=new URL(address(request));for(const [key,response] of entries){const found=new URL(key);if(found.origin===wanted.origin&&found.pathname===wanted.pathname&&(options.ignoreSearch||found.search===wanted.search))return response.clone();}},async put(request,response){entries.set(address(request),response.clone());},async addAll(files){installed.push(...files);for(const file of files)entries.set(address(file),new Response('installed'));},async keys(){return [...entries.keys()].map(url=>({url}));},async delete(request){return entries.delete(address(request));}};
 };
 const caches={async open(name){return cache(name);},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);},async match(request,options){for(const name of stores.keys()){const hit=await cache(name).match(request,options);if(hit)return hit;}}};
 const self={location:{origin,href:origin+'/sw.js'},addEventListener(type,handler){listeners[type]=handler;},async skipWaiting(){skipped=true;},clients:{async claim(){claimed=true;}}};
 vm.runInNewContext(source,{self,caches,URL,Response,setTimeout,clearTimeout,fetch(request){fetches.push(address(request));return Promise.resolve(network(request));}});
 function dispatch(type,request){const waits=[];let response;listeners[type]({request,respondWith(value){response=Promise.resolve(value);},waitUntil(value){waits.push(value);}});return {response,async done(){await Promise.all(waits);}};}
 return {stores,fetches,installed,cache,dispatch,get claimed(){return claimed;},get skipped(){return skipped;},get(url,mode='same-origin',method='GET'){return dispatch('fetch',{url:new URL(url,origin).href,mode,method,destination:'script'});}};
}
async function immediate(promise){let timeout;try{return await Promise.race([promise,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('cached startup waited for the network')),100);})]);}finally{clearTimeout(timeout);}}
test('saved opening page returns immediately with a stalled connection and a query string',async()=>{
 const h=harness(()=>new Promise(()=>{}));await h.cache(shell).put('/index.html',new Response('saved screen'));
 const response=await immediate(h.get('/?icon=blue','navigate').response);assert.equal(await response.text(),'saved screen');assert.equal(h.fetches.length,0);
});
test('startup scripts use the installed version and ignore cache-busting query differences',async()=>{
 const h=harness(()=>new Promise(()=>{}));await h.cache('obsolete-shell').put('/app.js',new Response('obsolete'));await h.cache(shell).put('/app.js?v=old',new Response('current shell'));
 assert.equal(await (await immediate(h.get('/app.js?v=new').response)).text(),'current shell');assert.equal(h.fetches.length,0);
});
test('private state, authenticated routes, calendar subscriptions and writes stay outside the screen cache',()=>{
 const h=harness();for(const url of ['/api/state','/api/push/config','/.netlify/functions/state','/calendar/barca.ics'])assert.equal(h.get(url).response,undefined,url);
 assert.equal(h.get('/app.js','same-origin','POST').response,undefined);assert.equal(h.get('https://other.test/app.js').response,undefined);
});
test('a missing public file is fetched and retained without touching private data',async()=>{
 const h=harness();const event=h.get('/app.js');assert.equal(await (await event.response).text(),'fresh');await event.done();assert.equal(await (await h.cache(shell).match('/app.js')).text(),'fresh');assert.equal(h.fetches.length,1);
});
test('install completes the screen files before activation and excludes optional poster downloads',async()=>{
 const h=harness();await h.dispatch('install').done();assert.ok(h.skipped);assert.ok(h.installed.some(path=>path.includes('app.js')));assert.ok(!h.installed.some(path=>/assets\/home\//.test(path)));
});
if(source.includes("ART='cartel-art-v1'"))test('updating the screen preserves existing artwork and fixture caches',async()=>{
 const h=harness();await h.cache('cartel-shell-v15').put('/assets/home/camp-nou-2.webp',new Response('saved photo'));await h.cache('cartel-data-v11').put('/api/fixtures',new Response('saved fixtures'));
 await h.dispatch('activate').done();assert.equal(await (await h.cache('cartel-art-v1').match('/assets/home/camp-nou-2.webp')).text(),'saved photo');assert.equal(await (await h.cache('cartel-data-v11').match('/api/fixtures')).text(),'saved fixtures');assert.ok(!h.stores.has('cartel-shell-v15'));assert.ok(h.claimed);
});
