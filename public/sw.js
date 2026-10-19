const SHELL='cartel-shell-v28', DATA='cartel-data-v11', CRESTS='cartel-crests-v2', ART='cartel-art-v1';
const FILES=['/','/index.html','/styles.css','/app.js','/match-display.js','/match-summary.js','/lineup.js','/poster-preferences.js','/timezones.js','/notifications.js','/pull-refresh.js','/state.js','/teams.js','/photos.js','/insights.js','/poster.js','/history.js','/stadiums.js','/home-photos.js','/photo-library.js','/competitions.js','/assets/home/camp-nou-1.webp','/assets/home/camp-nou-2.webp','/assets/home/camp-nou-3.webp','/assets/home/camp-nou-4.webp','/assets/home/camp-nou-5.webp','/assets/home/camp-nou-6.webp','/assets/home/camp-nou-7.webp','/assets/home/camp-nou-8.webp','/assets/home/camp-nou-9.webp','/assets/stadium-fallback.svg','/manifest.webmanifest','/icons/icon-v24.svg','/icons/apple-touch-icon-v24.png','/icons/icon-v24-192.png','/icons/icon-v24-512.png'];
const ART_FILES=FILES.filter(path=>path.startsWith('/assets/home/'));
const CORE=FILES.filter(path=>!ART_FILES.includes(path));
// Install the complete screen files first. Poster photos cache as they are viewed.
self.addEventListener('install',event=>{event.waitUntil(caches.open(SHELL).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{
 const art=await caches.open(ART);
 // Retain photographs downloaded by earlier releases before removing old shells.
 await Promise.all(ART_FILES.map(async path=>{try{if(await art.match(path))return;const saved=await caches.match(path);if(saved)await art.put(path,saved);}catch{}}));
 const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('cartel-')&&![SHELL,DATA,CRESTS,ART].includes(k)).map(k=>caches.delete(k)));
 await self.clients.claim();
})());});
self.addEventListener('push',event=>{event.waitUntil((async()=>{
 let payload;try{payload=event.data.json();}catch{payload={};}
 let title='Barca match reminder';
 if(payload.test||payload.tag==='barca-test')title='Barca notification test';
 else if(/^Barca match is after \d+ (?:minutes?|hours?|days?)(?: \d+ minutes?)?$/.test(payload.title||''))title=payload.title;
 else if(payload.kickoffUtc){
  // Strip details from reminders queued by the previous release as well.
  const minutes=Math.max(1,Math.ceil((Date.parse(payload.kickoffUtc)-Date.now())/60000));
  if(Number.isFinite(minutes)){
   const unit=(n,name)=>n+' '+name+(n===1?'':'s');
   const time=minutes%1440===0?unit(minutes/1440,'day'):minutes<60?unit(minutes,'minute'):unit(Math.floor(minutes/60),'hour')+(minutes%60?' '+unit(minutes%60,'minute'):'');
   title='Barca match is after '+time;
  }
 }
 let url='/#match';try{const target=new URL(payload.url,self.location.origin);if(target.origin===self.location.origin)url=target.href;}catch{}
 await self.registration.showNotification(title,{icon:'/icons/icon-v24-192.png',badge:'/icons/icon-v24-192.png',tag:payload.tag||'cartel-match',data:{url}});
})());});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const target=new URL(event.notification.data?.url||'/#match',self.location.origin);if(target.origin!==self.location.origin)return;const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);if(existing){await existing.navigate(target.href);await existing.focus();}else await self.clients.openWindow(target.href);})());});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET')return;
 if(url.origin!==self.location.origin){
   if(event.request.destination==='image'&&url.protocol==='https:'&&['crests.football-data.org','upload.wikimedia.org','thumb.wikimedia.org'].includes(url.hostname)){
     event.respondWith((async()=>{const cache=await caches.open(CRESTS);const saved=await cache.match(event.request);if(saved)return saved;try{const response=await fetch(event.request);if(response.ok||response.type==='opaque'){try{await cache.put(event.request,response.clone());const keys=await cache.keys();if(keys.length>32)await cache.delete(keys[0]);}catch{}}return response;}catch{return new Response('',{status:503});}})());
   }return;
 }
 if(url.pathname.startsWith('/calendar/'))return;
 if(['/api/fixtures','/api/team','/api/standings','/api/head-to-head','/api/stadiums'].includes(url.pathname)){
   event.respondWith((async()=>{const cache=await caches.open(DATA);try{const response=await fetch(event.request);if(response.ok){try{await cache.put(event.request,response.clone());}catch{}return response;}throw new Error('Unavailable');}catch{const old=await cache.match(event.request);if(!old)return new Response(JSON.stringify({error:'No saved fixtures'}),{status:503,headers:{'Content-Type':'application/json'}});const payload=await old.json();return new Response(JSON.stringify({...payload,stale:true,offline:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}})());return;
 }
 if(url.pathname.startsWith('/api/'))return;
 // Versioned, fully installed screen files open immediately, even on a slow link.
 // Browser service-worker update checks deliver the next complete shell version.
 if(event.request.mode==='navigate'||FILES.includes(url.pathname)){
  event.respondWith((async()=>{
   const cache=await caches.open(ART_FILES.includes(url.pathname)?ART:SHELL);
   const saved=await cache.match(event.request,{ignoreSearch:true})||(event.request.mode==='navigate'?await cache.match('/index.html'):null);
   if(saved)return saved;
   try{const response=await fetch(event.request);if(response.ok&&FILES.includes(url.pathname))event.waitUntil(cache.put(event.request,response.clone()).catch(()=>{}));return response;}
   catch{return new Response('Offline',{status:503});}
  })());
 }
});
