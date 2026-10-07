import test from 'node:test';
import assert from 'node:assert/strict';
import {base64url,unbase64,hkdf,encryptPush,vapidAuthorization,pushRequest,safeEndpoint,dueReminders,sendReminders} from '../worker/push.js';
const enc=new TextEncoder(),join=(...parts)=>Uint8Array.from(parts.flatMap(p=>Array.from(p)));
class KV{constructor(){this.store=new Map()}async get(k,t){const v=this.store.get(k);return v==null?null:t==='json'?JSON.parse(v):v}async put(k,v){this.store.set(k,v)}async delete(k){this.store.delete(k)}async list({prefix,limit}){return {keys:[...this.store.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(name=>({name}))}}}
async function setup(){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);return {env:{FIXTURES:new KV(),SITE_ORIGIN:'https://cartel.example',VAPID_PUBLIC_KEY:base64url(await crypto.subtle.exportKey('raw',pair.publicKey)),VAPID_PRIVATE_JWK:JSON.stringify(await crypto.subtle.exportKey('jwk',pair.privateKey))},pair};}
async function subscription(){const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);return {pair,value:{endpoint:'https://web.push.apple.com/push/example',keys:{p256dh:base64url(await crypto.subtle.exportKey('raw',pair.publicKey)),auth:base64url(crypto.getRandomValues(new Uint8Array(16)))}}};}
test('Web Push HKDF matches the independent RFC 8291 example',async()=>{
 const ikm=unbase64('S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg'),salt=unbase64('DGv6ra1nlYgDCS1FRnbzlw');
 assert.equal(base64url(await hkdf(ikm,salt,enc.encode('Content-Encoding: aes128gcm\0'),128)),'oIhVW04MRdy2XN9CiKLxTg');
 assert.equal(base64url(await hkdf(ikm,salt,enc.encode('Content-Encoding: nonce\0'),96)),'4h_95klXJ5E_qnoN');
});
test('encrypted push records decrypt with the receiver private key and correct final delimiter',async()=>{
 const {pair,value}=await subscription(),payload={title:'Barça',body:'Match reminder'},body=await encryptPush(value,payload);
 assert.equal(new DataView(body.buffer).getUint32(16),4096);assert.equal(body[20],65);
 const server=body.slice(21,86),pub=await crypto.subtle.importKey('raw',server,{name:'ECDH',namedCurve:'P-256'},false,[]),shared=await crypto.subtle.deriveBits({name:'ECDH',public:pub},pair.privateKey,256);
 const info=join(enc.encode('WebPush: info\0'),unbase64(value.keys.p256dh),server),ikm=await hkdf(shared,unbase64(value.keys.auth),info,256),salt=body.slice(0,16);
 const key=await crypto.subtle.importKey('raw',await hkdf(ikm,salt,enc.encode('Content-Encoding: aes128gcm\0'),128),'AES-GCM',false,['decrypt']),nonce=await hkdf(ikm,salt,enc.encode('Content-Encoding: nonce\0'),96);
 const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},key,body.slice(86)));
 assert.equal(plain.at(-1),2);assert.deepEqual(JSON.parse(new TextDecoder().decode(plain.slice(0,-1))),payload);
});
test('VAPID signs an ES256 token for the push-service origin with bounded expiry',async()=>{
 const {env,pair}=await setup(),now=Date.parse('2026-10-07T12:00:00Z'),auth=await vapidAuthorization('https://web.push.apple.com/path',env,now),jwt=auth.match(/t=([^,]+)/)[1],parts=jwt.split('.'),claims=JSON.parse(new TextDecoder().decode(unbase64(parts[1])));
 assert.equal(claims.aud,'https://web.push.apple.com');assert.equal(claims.exp,now/1000+12*3600);assert.equal(claims.sub,'https://cartel.example');
 assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pair.publicKey,unbase64(parts[2]),enc.encode(parts[0]+'.'+parts[1])),true);
});
test('subscriptions require HTTPS, matching origin, valid keys and the original device token',async()=>{
 const {env}=await setup(),{value}=await subscription();await env.FIXTURES.put('snapshot',JSON.stringify({demo:false}));
 const token=base64url(crypto.getRandomValues(new Uint8Array(32)));
 const request=(method,t=token,origin=env.SITE_ORIGIN)=>new Request(env.SITE_ORIGIN+'/api/push/subscription',{method,headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({subscription:value,leadMinutes:30})});
 assert.equal((await pushRequest(request('POST'),env)).status,200);
 assert.equal((await pushRequest(request('POST',base64url(crypto.getRandomValues(new Uint8Array(32)))),env)).status,403);
 assert.equal((await pushRequest(request('POST',token,'https://other.test'),env)).status,403);
 assert.equal(safeEndpoint('https://127.0.0.1/private'),null);assert.equal(safeEndpoint('https://web.push.apple.com.evil.test/x'),null);
 assert.equal((await pushRequest(request('DELETE'),env)).status,200);assert.equal((await env.FIXTURES.list({prefix:'push_sub_',limit:100})).keys.length,0);
 env.SITE_ORIGIN='http://localhost';assert.equal((await(await pushRequest(new Request('http://localhost/api/push/config'),env)).json()).ready,false);
});
test('reminders use confirmed kickoffs, respect lead time and revisions, and remove expired subscriptions',async()=>{
 const {env}=await setup(),{value}=await subscription(),now=Date.parse('2026-10-07T12:00:00Z');
 const fixture={id:'fd-1',status:'TIMED',timeConfirmed:true,kickoffUtc:new Date(now+30*60000).toISOString(),homeTeam:{name:'FC Barcelona'},awayTeam:{name:'Getafe CF'},competitionName:'La Liga'};
 const subscriber={subscription:value,leadMinutes:30,sent:{}};
 assert.equal(dueReminders([fixture,{...fixture,id:'fd-2',status:'POSTPONED'},{...fixture,id:'fd-3',timeConfirmed:false}],subscriber,now).length,1);
 assert.equal(dueReminders([fixture],subscriber,now+11*60000).length,0);
 await env.FIXTURES.put('snapshot',JSON.stringify({demo:false,checkedAt:new Date(now).toISOString(),fixtures:[fixture]}));await env.FIXTURES.put('push_sub_test',JSON.stringify(subscriber));
 assert.equal((await sendReminders(env,{now,fetcher:async()=>new Response('',{status:201})})).sent,1);
 assert.equal((await sendReminders(env,{now:now+5*60000,fetcher:async()=>{throw new Error('Duplicate')}})).sent,0);
 const saved=await env.FIXTURES.get('push_sub_test','json');assert.equal(dueReminders([{...fixture,kickoffUtc:new Date(now+35*60000).toISOString()}],saved,now+5*60000).length,1);
 await env.FIXTURES.put('push_sub_test',JSON.stringify(subscriber));await sendReminders(env,{now,fetcher:async()=>new Response('',{status:410})});assert.equal(await env.FIXTURES.get('push_sub_test','json'),null);
});
test('one-day reminders accept the healthy six-hour schedule while close matches require an hourly check',async()=>{
 const {env}=await setup(),{value}=await subscription(),now=Date.parse('2026-10-07T12:00:00Z');
 const fixture={id:'fd-day',status:'TIMED',timeConfirmed:true,kickoffUtc:new Date(now+24*3600000).toISOString(),homeTeam:{name:'FC Barcelona'},awayTeam:{name:'Getafe CF'},competitionName:'La Liga'};
 const subscriber={subscription:value,leadMinutes:1440,sent:{}};
 await env.FIXTURES.put('snapshot',JSON.stringify({demo:false,checkedAt:new Date(now-4*3600000).toISOString(),fixtures:[fixture]}));
 await env.FIXTURES.put('push_sub_test',JSON.stringify(subscriber));let requests=0;
 const fetcher=async()=>{requests++;return new Response('',{status:201})};
 assert.equal((await sendReminders(env,{now,fetcher})).sent,1);assert.equal(requests,1);
 await env.FIXTURES.put('snapshot',JSON.stringify({demo:false,checkedAt:new Date(now-13*3600000).toISOString(),fixtures:[fixture]}));
 assert.deepEqual(await sendReminders(env,{now,fetcher}),{skipped:'no-fresh-schedule'});
 const close={...fixture,kickoffUtc:new Date(now+30*60000).toISOString()};
 await env.FIXTURES.put('snapshot',JSON.stringify({demo:false,checkedAt:new Date(now-4*3600000).toISOString(),fixtures:[close]}));
 assert.deepEqual(await sendReminders(env,{now,fetcher}),{skipped:'no-fresh-schedule'});
 await env.FIXTURES.put('snapshot',JSON.stringify({demo:false,checkedAt:'invalid',fixtures:[fixture]}));
 assert.deepEqual(await sendReminders(env,{now,fetcher}),{skipped:'no-fresh-schedule'});assert.equal(requests,1);
});
