import {articlePhotos,filePhotos} from './photos.js';
import {CURATED_STADIUMS,stadiumArticle,safeStadium,safeVenue} from '../public/stadiums.js';
import {enrichmentRetryWait} from './retry.js';
const CURATED_FILES={'Camp Nou':'Camp Nou (Barcelona) - 13.jpg','Parc des Princes':'Parc des princes 2018.jpg'};
export async function refreshStadiums(env,{now=Date.now(),fetcher=fetch}={}){
 if(!env.FIXTURES||!env.FOOTBALL_DATA_TOKEN)return {skipped:'not-configured'};
 const snapshot=await env.FIXTURES.get('snapshot','json');if(!snapshot||snapshot.demo)return {skipped:'no-real-fixtures'};
 const ordered=snapshot.fixtures.slice().sort((a,b)=>{const futureA=Date.parse(a.kickoffUtc)>now,futureB=Date.parse(b.kickoffUtc)>now;return futureB-futureA||(futureA?Date.parse(a.kickoffUtc)-Date.parse(b.kickoffUtc):Date.parse(b.kickoffUtc)-Date.parse(a.kickoffUtc));});
 const teams=[...new Map(ordered.map(f=>[f.homeTeam.id,f.homeTeam])).values()];
 const saved=await env.FIXTURES.get('stadiums','json')||{schemaVersion:1,stadiums:{}};
 saved.venues||={};
 let attempted=0,updated=0,changed=false;
 for(const team of teams){
  if(attempted>=2)break;
  const key='stadium_'+team.id+'_meta',meta=await env.FIXTURES.get(key,'json')||{};
  if(meta.lastAttemptAt&&now-Date.parse(meta.lastAttemptAt)<enrichmentRetryWait(meta)||meta.lastSuccessAt&&now-Date.parse(meta.lastSuccessAt)<86400000)continue;
  attempted++;const at=new Date(now).toISOString();
  try{
   const response=await fetcher(`https://api.football-data.org/v4/teams/${team.id}`,{headers:{'X-Auth-Token':env.FOOTBALL_DATA_TOKEN},signal:AbortSignal.timeout(12000)});
   if(!response.ok){const error=new Error('Stadium provider returned '+response.status);error.accessUnavailable=[403,404].includes(response.status);throw error;}
   const club=await response.json();if(club.id!==team.id||typeof club.venue!=='string'||!club.venue.trim())throw new Error('Home stadium unavailable');
   const venue=safeVenue({name:club.venue,checkedAt:at});if(!venue)throw new Error('Unusable home stadium');
   saved.venues[team.id]=venue;saved.checkedAt=at;changed=true;
   const article=stadiumArticle(club.venue);if(!article)throw new Error('Unusable stadium name');
   const file=CURATED_FILES[article];
   const photos=file?await filePhotos([file],{fetcher}):await articlePhotos([article],{fetcher,width:1280,stadiumOnly:true});
   const photo=photos.get(file||article);if(!photo)throw new Error('Stadium photo unavailable');
   const stadium={name:club.venue,article,photo,checkedAt:at};if(!safeStadium(stadium))throw new Error('Invalid stadium image');
   saved.stadiums[team.id]=stadium;saved.checkedAt=at;changed=true;
   await env.FIXTURES.put(key,JSON.stringify({lastAttemptAt:at,lastSuccessAt:at,failures:0}));updated++;
  }catch(error){await env.FIXTURES.put(key,JSON.stringify({...meta,lastAttemptAt:at,failures:(meta.failures||0)+1,accessUnavailable:!!error.accessUnavailable,lastError:error.message}));}
 }
 if(changed)await env.FIXTURES.put('stadiums',JSON.stringify(saved));
 return {attempted,updated};
}
export async function stadiumResponse(request,env){
 const saved=await env.FIXTURES?.get('stadiums','json');
 const stadiums={...CURATED_STADIUMS},venues={};
 // Older successful photo records also came from a verified team response.
 // Static historical artwork alone is deliberately not evidence of a venue.
 for(const [id,stadium] of Object.entries(saved?.stadiums||{})){const venue=safeVenue(stadium);if(/^\d+$/.test(id)&&venue)venues[id]=venue;}
 for(const [id,venue] of Object.entries(saved?.venues||{}))if(/^\d+$/.test(id)&&safeVenue(venue))venues[id]=safeVenue(venue);
 for(const [id,stadium] of Object.entries(saved?.stadiums||{}))if(/^\d+$/.test(id)&&safeStadium(stadium))stadiums[id]=stadium;
 return new Response(request.method==='HEAD'?null:JSON.stringify({schemaVersion:1,checkedAt:saved?.checkedAt||null,stadiums,venues}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}
