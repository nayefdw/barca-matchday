import test from 'node:test';
import assert from 'node:assert/strict';
import {SchedulerCore} from '../worker/scheduler-core.js';
import {matchPlan,reminderMark} from '../worker/match-schedule.js';
import {base64url,sendReminders} from '../worker/push.js';
class Storage{
 constructor(){this.data=new Map();this.alarm=null;}
 async get(key){return structuredClone(this.data.get(key));}
 async put(key,value){if(typeof key==='object')for(const [k,v] of Object.entries(key))this.data.set(k,structuredClone(v));else this.data.set(key,structuredClone(value));}
 async delete(key){this.data.delete(key);}
 async list({prefix,limit=1000}){return new Map([...this.data.entries()].filter(([k])=>k.startsWith(prefix)).slice(0,limit).map(([k,v])=>[k,structuredClone(v)]));}
 async getAlarm(){return this.alarm;}
 async setAlarm(at){this.alarm=at;}
 async deleteAlarm(){this.alarm=null;}
}
class KV extends Storage{
 constructor(){super();this.writes=0;this.reads=0;}
 async get(key,type){this.reads++;const value=await super.get(key);return value==null?null:type==='json'?JSON.parse(value):value;}
 async put(key,value){this.writes++;return super.put(key,value);}
 async list(options){const values=await super.list(options);return {keys:[...values.keys()].map(name=>({name}))};}
}
const start=Date.parse('2026-10-13T19:00:00Z'),day=start-2*86400000;
const fixture=()=>({id:'fd-1',status:'TIMED',timeConfirmed:true,kickoffUtc:new Date(start).toISOString(),homeTeam:{name:'Barcelona'},awayTeam:{name:'Getafe'},competitionName:'La Liga'});
async function setup(){
 let now=day;const storage=new Storage(),kv=new KV(),pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const client=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const subscription={endpoint:'https://web.push.apple.com/push/scheduler-test',keys:{p256dh:base64url(await crypto.subtle.exportKey('raw',client.publicKey)),auth:base64url(crypto.getRandomValues(new Uint8Array(16)))}};
 const token=base64url(crypto.getRandomValues(new Uint8Array(32))),digest=async v=>base64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));
 const key='push_sub_'+await digest(subscription.endpoint),subscriber={subscription,authHash:await digest(token),leadMinutes:30,sent:{},updatedAt:new Date(day-86400000).toISOString()};
 const snapshot={demo:false,checkedAt:new Date(day).toISOString(),fixtures:[fixture()]};
 await kv.put('snapshot',JSON.stringify(snapshot));await kv.put(key,JSON.stringify(subscriber));kv.writes=0;
 const env={FIXTURES:kv,SITE_ORIGIN:'https://example.test',VAPID_PUBLIC_KEY:base64url(await crypto.subtle.exportKey('raw',pair.publicKey)),VAPID_PRIVATE_JWK:JSON.stringify(await crypto.subtle.exportKey('jwk',pair.privateKey))};
 const calls=[],jobs={clock:()=>now,refresh:async(e,options)=>{calls.push('refresh');assert.equal(options.force,true);const saved=await e.FIXTURES.get('snapshot','json');saved.checkedAt=new Date(options.now).toISOString();await e.FIXTURES.put('snapshot',JSON.stringify(saved));return {updated:saved.fixtures.length};},sendReminders:async(e,options)=>sendReminders(e,{...options,fetcher:async()=>{calls.push('push');return new Response('',{status:201});}})};
 for(const job of ['refreshTeam','refreshStandings','refreshHistory','refreshStadiums'])jobs[job]=async()=>{calls.push(job);};
 const make=()=>new SchedulerCore({storage},env,jobs);let core=make();
 const request=(operation,method='POST',leadMinutes=30)=>new Request(env.SITE_ORIGIN+'/api/push/'+operation,{method,headers:{Origin:env.SITE_ORIGIN,'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({subscription,leadMinutes})});
 return {storage,kv,env,subscriber,snapshot,key,token,jobs,calls,make,core,request,setTime:value=>{now=value;}};
}
test('off-day bootstrap keeps existing devices and sets one exact match timer without polling',async()=>{
 const s=await setup();await s.core.fetch(new Request('https://scheduler/internal/schedule'));
 assert.equal(s.storage.alarm,start-40*60000);assert.deepEqual(s.calls,[]);assert.equal(s.kv.writes,0);
 assert.deepEqual(await s.core.store.get(s.key,'json'),s.subscriber);
 const reads=s.kv.reads;s.setTime(day+3600000);await s.make().fetch(new Request('https://scheduler/internal/schedule'));
 assert.equal(s.kv.reads,reads);assert.equal(s.storage.alarm,start-40*60000);
});
test('before-match refresh schedules exact reminder, then post-match update, with no interim wakeups',async()=>{
 const s=await setup();await s.core.initialize();s.setTime(start-40*60000);s.storage.alarm=null;await s.core.alarm();
 assert.equal(s.storage.alarm,start-30*60000);assert.equal(s.calls.filter(v=>v==='refresh').length,1);assert.ok(!s.calls.includes('push'));
 s.setTime(start-30*60000);s.storage.alarm=null;await s.core.alarm();assert.equal(s.calls.filter(v=>v==='push').length,1);assert.equal(s.storage.alarm,start+3*3600000);
 const status=await (await s.core.fetch(s.request('status'))).json();assert.equal(status.lastDelivery.status,201);assert.equal(status.nextReminderAt,null);
 // Redelivery/restart must not send a successful reminder twice.
 await s.make().alarm();assert.equal(s.calls.filter(v=>v==='push').length,1);
 s.setTime(start+3*3600000);s.storage.alarm=null;await s.core.alarm();assert.equal(s.storage.alarm,null);
});
test('a changed or cancelled kickoff replaces the saved timer before any push',async()=>{
 for(const status of ['TIMED','CANCELLED']){
  const s=await setup();await s.core.initialize();s.jobs.refresh=async e=>{const saved=await e.FIXTURES.get('snapshot','json');saved.checkedAt=new Date(start-40*60000).toISOString();saved.fixtures[0].status=status;saved.fixtures[0].kickoffUtc=new Date(start+86400000).toISOString();await e.FIXTURES.put('snapshot',JSON.stringify(saved));return {updated:1};};
  s.core=s.make();s.setTime(start-40*60000);await s.core.alarm();assert.equal(s.storage.alarm,status==='CANCELLED'?null:start+86400000-40*60000);assert.ok(!s.calls.includes('push'));
 }
});
test('provider outage keeps confirmed reminders eligible and limits refresh retries',async()=>{
 const s=await setup();s.jobs.refresh=async()=>{s.calls.push('failed-refresh');return {error:'provider unavailable'};};s.core=s.make();await s.core.initialize();
 for(const offset of [40,35,25,5]){s.setTime(start-offset*60000);s.storage.alarm=null;await s.core.alarm();}
 assert.equal(s.calls.filter(v=>v==='failed-refresh').length,4);assert.equal(s.calls.filter(v=>v==='push').length,1);
 assert.equal(s.storage.alarm,start+3*3600000);assert.equal(Object.keys((await s.core.inputs()).state.retries).length,0);
});
test('failed push schedules a targeted retry and a successful retry survives object restart',async()=>{
 const s=await setup();let pushes=0;s.jobs.sendReminders=(e,o)=>sendReminders(e,{...o,fetcher:async()=>new Response('',{status:++pushes===1?503:201})});s.core=s.make();await s.core.initialize();
 s.setTime(start-30*60000);s.storage.alarm=null;await s.core.alarm();assert.equal(s.storage.alarm,start-25*60000);
 s.setTime(start-25*60000);s.storage.alarm=null;await s.make().alarm();assert.equal(pushes,2);assert.equal(s.storage.alarm,start+3*3600000);
 assert.equal((await s.core.store.get(s.key,'json')).deliveryFailures,0);
});
test('editing a device lead time immediately reschedules; disabling removes its reminder',async()=>{
 const s=await setup();await s.core.fetch(s.request('subscription','POST',1440));assert.equal(s.storage.alarm,start-1440*60000-10*60000);
 const status=await (await s.core.fetch(s.request('status'))).json();assert.equal(status.nextReminderAt,new Date(start-1440*60000).toISOString());
 await s.core.fetch(s.request('subscription','DELETE'));assert.equal((await s.core.inputs()).subscribers.length,0);assert.equal(s.storage.alarm,start-40*60000);assert.equal(await s.kv.get(s.key),null);
});
test('unknown kickoff times get date-specific confirmation checks and no push',()=>{
 const f={...fixture(),timeConfirmed:false,status:'SCHEDULED',kickoffUtc:'2026-10-13T00:00:00Z'},s={...fixture(),leadMinutes:30,sent:{}};
 const events=matchPlan({demo:false,checkedAt:new Date(day).toISOString(),fixtures:[f]},[s],{},day);
 assert.equal(events[0].at,Date.parse('2026-10-12T09:00:00Z'));assert.equal(events.some(v=>v.kind==='reminder'),false);
 assert.deepEqual(matchPlan({demo:false,checkedAt:new Date(start+2*86400000).toISOString(),fixtures:[f]},[s],{},start+2*86400000),[]);
});
test('expired subscriptions are removed and do not leave a reminder retry',async()=>{
 const s=await setup();s.jobs.sendReminders=(e,o)=>sendReminders(e,{...o,fetcher:async()=>new Response('',{status:410})});s.core=s.make();await s.core.initialize();s.setTime(start-30*60000);await s.core.alarm();
 assert.equal((await s.core.inputs()).subscribers.length,0);assert.equal(await s.kv.get(s.key),null);assert.equal(s.storage.alarm,start+3*3600000);
});
test('KV mirror quota failure does not erase durable accepted-delivery deduplication',async()=>{
 const s=await setup();await s.core.initialize();s.kv.put=async()=>{throw new Error('quota');};s.setTime(start-30*60000);await s.core.alarm();await s.make().alarm();
 assert.equal(s.calls.filter(v=>v==='push').length,1);assert.ok((await s.core.store.get(s.key,'json')).sent[reminderMark(fixture(),s.subscriber)]);
});
test('late alarms skip expired reminder windows rather than alerting after kickoff',async()=>{
 const s=await setup();await s.core.initialize();s.setTime(start+60000);await s.core.alarm();assert.ok(!s.calls.includes('push'));assert.equal(s.storage.alarm,start+3*3600000);
});
test('invalid push configuration or an invalid endpoint cannot create a rapid alarm loop',async()=>{
 for(const bad of ['configuration','endpoint']){
  const s=await setup();if(bad==='configuration')s.env.VAPID_PRIVATE_JWK='invalid';else s.subscriber.subscription.endpoint='https://untrusted.test/push';
  if(bad==='endpoint')await s.kv.put(s.key,JSON.stringify(s.subscriber));
  s.core=s.make();await s.core.initialize();s.setTime(start-30*60000);await s.core.alarm();
  assert.ok(!s.calls.includes('push'));assert.equal(s.storage.alarm,start+3*3600000);
 }
});
test('an empty deployment gets one initial-load alarm with bounded failures, then stops',async()=>{
 const s=await setup();await s.kv.delete('snapshot');s.env.FOOTBALL_DATA_TOKEN='test';s.jobs.refresh=async()=>({error:'provider unavailable'});s.core=s.make();
 await s.core.fetch(new Request('https://example.test/api/push/config'));assert.equal(s.storage.alarm,day+1000);
 for(const at of [day+1000,day+5*60000+1000,day+15*60000+1000,day+35*60000+1000]){s.setTime(at);s.storage.alarm=null;await s.core.alarm();}
 assert.equal(s.storage.alarm,null);assert.equal((await s.core.inputs()).snapshot,null);
});
