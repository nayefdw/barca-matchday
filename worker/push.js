import {refreshInterval} from './refresh.js';
// RFC 8291 aes128gcm encryption and RFC 8292 VAPID, using Web Crypto.
const utf8=new TextEncoder();
export const LEAD_TIMES=[15,30,60,120,1440];
export function reminderTitle(kickoffUtc,now=Date.now()){
 const minutes=Math.max(1,Math.ceil((Date.parse(kickoffUtc)-now)/60000));
 if(!Number.isFinite(minutes))return 'Barca match reminder';
 const unit=(n,name)=>n+' '+name+(n===1?'':'s');
 const time=minutes%1440===0?unit(minutes/1440,'day'):minutes<60?unit(minutes,'minute'):unit(Math.floor(minutes/60),'hour')+(minutes%60?' '+unit(minutes%60,'minute'):'');
 return 'Barca match is after '+time;
}
export const base64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export const unbase64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const join=(...parts)=>{const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;};
export async function hkdf(input,salt,info,bits){const key=await crypto.subtle.importKey('raw',input,'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},key,bits));}
export function safeEndpoint(value){
 try{const url=new URL(value),host=url.hostname;return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.hash&&value.length<2048&&(host==='fcm.googleapis.com'||host.endsWith('.push.apple.com')||host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com'))?url.href:null;}catch{return null;}
}
export async function validateSubscription(value){
 const endpoint=safeEndpoint(value?.endpoint);if(!endpoint)throw new Error('Unsupported push endpoint');
 const p256dh=value.keys?.p256dh,auth=value.keys?.auth;
 if(typeof p256dh!=='string'||typeof auth!=='string'||!/^[-\w]+$/.test(p256dh)||!/^[-\w]+$/.test(auth))throw new Error('Invalid push keys');
 const pub=unbase64(p256dh);if(pub.length!==65||pub[0]!==4||unbase64(auth).length!==16)throw new Error('Invalid push keys');
 await crypto.subtle.importKey('raw',pub,{name:'ECDH',namedCurve:'P-256'},false,[]);
 return {endpoint,keys:{p256dh,auth}};
}
export async function encryptPush(subscription,payload){
 const client=unbase64(subscription.keys.p256dh),auth=unbase64(subscription.keys.auth);
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const server=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
 const clientKey=await crypto.subtle.importKey('raw',client,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:clientKey},pair.privateKey,256));
 const ikm=await hkdf(shared,auth,join(utf8.encode('WebPush: info\0'),client,server),256);
 const salt=crypto.getRandomValues(new Uint8Array(16)),cek=await hkdf(ikm,salt,utf8.encode('Content-Encoding: aes128gcm\0'),128),nonce=await hkdf(ikm,salt,utf8.encode('Content-Encoding: nonce\0'),96);
 const message=join(utf8.encode(JSON.stringify(payload)),new Uint8Array([2]));if(message.length>3993)throw new Error('Push message too large');
 const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,message));
 const record=new Uint8Array(4);new DataView(record.buffer).setUint32(0,4096);
 return join(salt,record,new Uint8Array([server.length]),server,encrypted);
}
function vapidKeys(env){
 try{const privateKey=JSON.parse(env.VAPID_PRIVATE_JWK),publicKey=unbase64(env.VAPID_PUBLIC_KEY);if(privateKey.kty!=='EC'||privateKey.crv!=='P-256'||unbase64(privateKey.d).length!==32||publicKey.length!==65||base64url(join(new Uint8Array([4]),unbase64(privateKey.x),unbase64(privateKey.y)))!==env.VAPID_PUBLIC_KEY)return null;return {privateKey,publicKey:env.VAPID_PUBLIC_KEY};}catch{return null;}
}
export function pushConfigured(env){try{return !!env.FIXTURES&&!!vapidKeys(env)&&new URL(env.SITE_ORIGIN).protocol==='https:';}catch{return false;}}
export async function vapidAuthorization(endpoint,env,now=Date.now()){
 const keys=vapidKeys(env);if(!keys)throw new Error('Push keys not configured');
 const subject=env.VAPID_SUBJECT||new URL(env.SITE_ORIGIN).origin;
 if(!/^(https:\/\/|mailto:)/.test(subject))throw new Error('Invalid VAPID subject');
 const head=base64url(utf8.encode(JSON.stringify({typ:'JWT',alg:'ES256'}))),body=base64url(utf8.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(now/1000)+12*3600,sub:subject}))),content=head+'.'+body;
 const key=await crypto.subtle.importKey('jwk',keys.privateKey,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,utf8.encode(content));
 return `vapid t=${content}.${base64url(signature)}, k=${keys.publicKey}`;
}
const digest=async value=>base64url(await crypto.subtle.digest('SHA-256',utf8.encode(value)));
export async function deliverPush(subscription,payload,env,{now=Date.now(),fetcher=fetch,ttl=300}={}){
 const endpoint=safeEndpoint(subscription?.endpoint);if(!endpoint)throw new Error('Unsupported push endpoint');
 const body=await encryptPush(subscription,payload),authorization=await vapidAuthorization(endpoint,env,now);
 // Workers does not support redirect:'error'. Manual mode prevents credentials
 // being forwarded and lets the caller treat any redirect as a failure.
 return fetcher(endpoint,{method:'POST',redirect:'manual',headers:{Authorization:authorization,'Content-Type':'application/octet-stream','Content-Encoding':'aes128gcm',TTL:String(ttl),Urgency:'normal'},body,signal:AbortSignal.timeout(10000)});
}
function deliveryOutcome(subscriber,response,kind,now,error=false){
 const accepted=!!response?.ok,status=response?.status||null;
 subscriber.lastDelivery={kind,at:new Date(now).toISOString(),accepted,status,...(error?{error:'delivery-error'}:{})};
 subscriber.deliveryFailures=accepted?0:(subscriber.deliveryFailures||0)+1;
 if(accepted)delete subscriber.retryAfterAt;
 else{
  let delay=[400,401,403].includes(status)?3600000:Math.min(1800000,300000*2**Math.min(3,subscriber.deliveryFailures-1));
  const retry=response?.headers?.get('Retry-After');
  const seconds=Number(retry),date=Date.parse(retry);
  if(retry)delay=Math.max(delay,Number.isFinite(seconds)?seconds*1000:Number.isFinite(date)?date-now:0);
  subscriber.retryAfterAt=new Date(now+Math.min(86400000,delay)).toISOString();
 }
}
export async function pushRequest(request,env){
 const url=new URL(request.url),snapshot=await env.FIXTURES?.get('snapshot','json');
 const ready=pushConfigured(env)&&url.protocol==='https:'&&!!snapshot&&!snapshot.demo;
 const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
 if(url.pathname==='/api/push/config')return ['GET','HEAD'].includes(request.method)?new Response(request.method==='HEAD'?null:JSON.stringify({ready,publicKey:ready?env.VAPID_PUBLIC_KEY:null}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}):json({error:'Method not allowed'},405);
 const operation=url.pathname.split('/').at(-1);
 if(!['subscription','status','test'].includes(operation))return json({error:'Not found'},404);
 if(!(operation==='subscription'?['POST','DELETE']:['POST']).includes(request.method))return json({error:'Method not allowed'},405);
 if(!ready)return json({error:'Match reminders are not ready yet.'},503);
 if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Invalid request origin'},403);
 const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token||!/^[-\w]{43}$/.test(token))return json({error:'Device authorization required'},401);
 const raw=await request.text();if(raw.length>4096)return json({error:'Request too large'},413);
 let value;try{value=JSON.parse(raw);}catch{return json({error:'Invalid request'},400);}
 const endpoint=safeEndpoint(value.subscription?.endpoint||value.endpoint);if(!endpoint)return json({error:'Invalid subscription'},400);
 const key='push_sub_'+await digest(endpoint),authHash=await digest(token),old=await env.FIXTURES.get(key,'json');
 if(old&&old.authHash!==authHash)return json({error:'This subscription belongs to another device session.'},403);
 if(operation!=='subscription'){
  if(!old)return json({error:'Enable reminders again to reconnect this device.'},404);
  if(operation==='status')return json({enabled:true,leadMinutes:old.leadMinutes,lastDelivery:old.lastDelivery||null,deliveryFailures:old.deliveryFailures||0,...(env.nextDeviceReminder?{nextReminderAt:env.nextDeviceReminder(snapshot,old)}:{})});
  const previous=Math.max(Date.parse(old.updatedAt)||0,Date.parse(old.lastDelivery?.at)||0);
  if(Date.now()-previous<60000)return json({error:'Wait a minute before sending another test.'},429);
  let response;
  try{response=await deliverPush(old.subscription,{title:'Barca notification test',body:'',test:true,url:env.SITE_ORIGIN+'/#settings',tag:'barca-test'},env);deliveryOutcome(old,response,'test',Date.now());}
  catch{deliveryOutcome(old,null,'test',Date.now(),true);}
  await env.FIXTURES.put(key,JSON.stringify(old));
  return json({accepted:old.lastDelivery.accepted,status:old.lastDelivery.status,...(!old.lastDelivery.accepted?{error:'The notification service did not accept the test. Try reconnecting reminders.'}:{})},old.lastDelivery.accepted?200:502);
 }
 if(request.method==='DELETE'){if(old)await env.FIXTURES.delete(key);return json({disabled:true});}
 if(!LEAD_TIMES.includes(value.leadMinutes))return json({error:'Invalid reminder time'},400);
 let subscription;try{subscription=await validateSubscription(value.subscription);}catch{return json({error:'Invalid subscription keys'},400);}
 if(!old){const list=await env.FIXTURES.list({prefix:'push_sub_',limit:21});if(list.keys.length>=20)return json({error:'This personal app has reached its device limit.'},429);}
 if(old&&old.leadMinutes===value.leadMinutes&&old.subscription.keys.p256dh===subscription.keys.p256dh&&old.subscription.keys.auth===subscription.keys.auth)return json({enabled:true,leadMinutes:value.leadMinutes});
 await env.FIXTURES.put(key,JSON.stringify({...old,subscription,authHash,leadMinutes:value.leadMinutes,sent:old?.sent||{},updatedAt:new Date().toISOString()}));
 return json({enabled:true,leadMinutes:value.leadMinutes});
}
export function dueReminders(fixtures,subscriber,now){return fixtures.filter(f=>f.timeConfirmed&&f.status==='TIMED'&&Date.parse(f.kickoffUtc)>now).filter(f=>{const due=Date.parse(f.kickoffUtc)-subscriber.leadMinutes*60000,mark=f.id+'|'+f.kickoffUtc+'|'+subscriber.leadMinutes;return now>=due&&now-due<Math.min(30,subscriber.leadMinutes)*60000&&!subscriber.sent?.[mark];});}
export async function sendReminders(env,{now=Date.now(),fetcher=fetch,scheduled=false}={}){
 if(!pushConfigured(env))return {skipped:'not-configured'};
 const snapshot=await env.FIXTURES.get('snapshot','json'),checkedAt=Date.parse(snapshot?.checkedAt);
 // Legacy/local callers require a recent snapshot. The match-time scheduler
 // checks the schedule before the reminder, but preserves confirmed cached
 // reminders if that targeted provider check has an outage.
 if(!snapshot||snapshot.demo||!Array.isArray(snapshot.fixtures)||!Number.isFinite(checkedAt)||!scheduled&&now-checkedAt>refreshInterval(snapshot,now)*2)return {skipped:'no-fresh-schedule'};
 const list=await env.FIXTURES.list({prefix:'push_sub_',limit:20});let sent=0;
 for(const item of list.keys){const subscriber=await env.FIXTURES.get(item.name,'json');if(!subscriber)continue;
   if(now<Date.parse(subscriber.retryAfterAt))continue;
   let changed=false;
   for(const fixture of dueReminders(snapshot.fixtures,subscriber,now)){
     try{
       const endpoint=safeEndpoint(subscriber.subscription.endpoint);if(!endpoint)continue;
       const target=new URL('/',env.SITE_ORIGIN);target.searchParams.set('match',fixture.id);target.hash='match';
       const payload={title:reminderTitle(fixture.kickoffUtc,now),body:'',url:target.href,tag:'cartel-'+fixture.id};
       const response=await deliverPush(subscriber.subscription,payload,env,{now,fetcher,ttl:Math.min(3600,Math.max(60,Math.floor((Date.parse(fixture.kickoffUtc)-now)/1000)))});
       deliveryOutcome(subscriber,response,'reminder',now);changed=true;
       if([404,410].includes(response.status)){await env.FIXTURES.delete(item.name);changed=false;break;}
       if(!response.ok)break;
       subscriber.sent={...subscriber.sent,[fixture.id+'|'+fixture.kickoffUtc+'|'+subscriber.leadMinutes]:new Date(now).toISOString()};
       subscriber.sent=Object.fromEntries(Object.entries(subscriber.sent).slice(-60));sent++;
     }catch{deliveryOutcome(subscriber,null,'reminder',now,true);changed=true;break;}
   }
   if(changed)await env.FIXTURES.put(item.name,JSON.stringify(subscriber));
 }
 return {sent};
}
