import test from 'node:test';
import assert from 'node:assert/strict';
import {base64url,pushRequest,sendReminders} from '../worker/push.js';
import {runScheduled} from '../worker/index.js';
import {refresh} from '../worker/refresh.js';
import {refreshStadiums} from '../worker/stadiums.js';
class KV{
 constructor(){this.store=new Map();this.writes=new Map();}
 async get(key,type){const value=this.store.get(key);return value==null?null:type==='json'?JSON.parse(value):value;}
 async put(key,value){this.writes.set(key,(this.writes.get(key)||0)+1);this.store.set(key,value);}
 async list({prefix,limit}){return {keys:[...this.store.keys()].filter(key=>key.startsWith(prefix)).slice(0,limit).map(name=>({name}))};}
 async delete(key){this.store.delete(key);}
}
const now=Date.parse('2026-10-11T12:00:00Z');
async function setup(){
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const client=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const env={FIXTURES:new KV(),SITE_ORIGIN:'https://example.test',VAPID_PUBLIC_KEY:base64url(await crypto.subtle.exportKey('raw',pair.publicKey)),VAPID_PRIVATE_JWK:JSON.stringify(await crypto.subtle.exportKey('jwk',pair.privateKey))};
 const subscription={endpoint:'https://web.push.apple.com/push/test',keys:{p256dh:base64url(await crypto.subtle.exportKey('raw',client.publicKey)),auth:base64url(crypto.getRandomValues(new Uint8Array(16)))}};
 const fixture={id:'fd-1',status:'TIMED',timeConfirmed:true,kickoffUtc:new Date(now+30*60000).toISOString(),homeTeam:{name:'Barcelona'},awayTeam:{name:'Getafe'},competitionName:'La Liga'};
 await env.FIXTURES.put('snapshot',JSON.stringify({demo:false,checkedAt:new Date(now).toISOString(),fixtures:[fixture]}));
 await env.FIXTURES.put('push_sub_test',JSON.stringify({subscription,leadMinutes:30,sent:{}}));
 env.FIXTURES.writes.clear();return {env,subscription};
}
test('reminders use the Workers-supported redirect mode and record acceptance once',async()=>{
 const {env}=await setup();let calls=0;
 const fetcher=async(url,options)=>{calls++;assert.equal(options.redirect,'manual');assert.ok(options.body.byteLength>86);return new Response('',{status:201});};
 assert.equal((await sendReminders(env,{now,fetcher})).sent,1);
 const sub=await env.FIXTURES.get('push_sub_test','json');assert.deepEqual(sub.lastDelivery,{kind:'reminder',at:new Date(now).toISOString(),accepted:true,status:201});
 assert.equal(env.FIXTURES.writes.get('push_sub_test'),1);
 assert.equal((await sendReminders(env,{now:now+5*60000,fetcher})).sent,0);assert.equal(calls,1);
});
test('failed delivery is visible, backs off and leaves the reminder eligible for recovery',async()=>{
 const {env}=await setup();let calls=0;
 const fetcher=async()=>{calls++;return new Response('',{status:503,headers:{'Retry-After':'600'}});};
 await sendReminders(env,{now,fetcher});
 const sub=await env.FIXTURES.get('push_sub_test','json');assert.equal(sub.lastDelivery.status,503);assert.equal(sub.deliveryFailures,1);assert.deepEqual(sub.sent,{});
 await sendReminders(env,{now:now+5*60000,fetcher});assert.equal(calls,1);
 assert.equal((await sendReminders(env,{now:now+10*60000,fetcher:async()=>new Response('',{status:201})})).sent,1);
});
test('transport exceptions produce a saved failure instead of disappearing silently',async()=>{
 const {env}=await setup();await sendReminders(env,{now,fetcher:async()=>{throw new TypeError('private endpoint must never appear in diagnostics');}});
 const sub=await env.FIXTURES.get('push_sub_test','json');assert.equal(sub.lastDelivery.error,'delivery-error');assert.equal(sub.lastDelivery.status,null);assert.equal(sub.lastDelivery.accepted,false);assert.ok(!JSON.stringify(sub.lastDelivery).includes('private endpoint'));
});
test('per-device delivery status is protected and unchanged settings do not write again',async()=>{
 const {env,subscription}=await setup(),token=base64url(crypto.getRandomValues(new Uint8Array(32)));
 const request=(action,t=token)=>new Request(env.SITE_ORIGIN+'/api/push/'+action,{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({subscription,leadMinutes:30})});
 await pushRequest(request('subscription'),env);env.FIXTURES.writes.clear();
 assert.equal((await pushRequest(request('subscription'),env)).status,200);assert.equal(env.FIXTURES.writes.size,0);
 assert.equal((await pushRequest(request('status'),env)).status,200);
 assert.equal((await pushRequest(request('status',base64url(crypto.getRandomValues(new Uint8Array(32)))),env)).status,403);
 assert.equal((await pushRequest(request('test'),env)).status,429);
});
test('retired cron invocations do no recurring work while removal propagates',async()=>{
 const calls=[],jobs=Object.fromEntries(['refresh','sendReminders','refreshStandings','refreshTeam','refreshHistory','refreshStadiums'].map(name=>[name,async()=>{calls.push(name);if(name==='refresh')throw new Error('failed');return {ok:true};}]));
 assert.deepEqual(await runScheduled({scheduledTime:now},{},jobs),{skipped:'match-time-scheduler'});assert.equal(calls.length,0);
 await runScheduled({scheduledTime:now+5*60000},{},jobs);assert.deepEqual(calls,[]);
});
test('refresh success and failure each write a metadata key only once',async()=>{
 for(const status of [200,503]){
  const env={FIXTURES:new KV(),FOOTBALL_DATA_TOKEN:'test'};
  await refresh(env,{now,fetcher:async()=>Response.json({matches:[]},{status})});
  assert.equal(env.FIXTURES.writes.get('meta'),1);
 }
});
test('repeated missing stadium details back off for a day without any writes',async()=>{
 const env={FIXTURES:new KV(),FOOTBALL_DATA_TOKEN:'test'};
 await env.FIXTURES.put('snapshot',JSON.stringify({demo:false,fixtures:[{homeTeam:{id:81},kickoffUtc:new Date(now+86400000).toISOString()}]}));
 await env.FIXTURES.put('stadium_81_meta',JSON.stringify({lastAttemptAt:new Date(now-2*3600000).toISOString(),failures:93}));env.FIXTURES.writes.clear();
 assert.deepEqual(await refreshStadiums(env,{now,fetcher:async()=>{throw new Error('must not fetch');}}),{attempted:0,updated:0});assert.equal(env.FIXTURES.writes.size,0);
});
test('two partial stadium updates preserve both venues with one shared write',async()=>{
 const env={FIXTURES:new KV(),FOOTBALL_DATA_TOKEN:'test'};
 await env.FIXTURES.put('snapshot',JSON.stringify({demo:false,fixtures:[81,82].map(id=>({homeTeam:{id},kickoffUtc:new Date(now+86400000).toISOString()}))}));env.FIXTURES.writes.clear();
 await refreshStadiums(env,{now,fetcher:async url=>url.includes('football-data.org')?Response.json({id:Number(url.split('/').at(-1)),venue:'Test stadium'}):Response.json({query:{pages:[]}})});
 assert.equal(env.FIXTURES.writes.get('stadiums'),1);assert.equal(env.FIXTURES.writes.get('stadium_81_meta'),1);assert.equal(env.FIXTURES.writes.get('stadium_82_meta'),1);
 assert.equal(Object.keys((await env.FIXTURES.get('stadiums','json')).venues).length,2);
});
