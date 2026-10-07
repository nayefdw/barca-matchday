import {playerArticle,safePhoto,safePhotoCredit} from '../public/photos.js';
const text=value=>String(value||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').trim().slice(0,300);
const headers={'User-Agent':'CartelBarca/2.1 (independent fixture PWA; Wikimedia photo attribution in player profiles)'};
async function query(host,params,fetcher){const url=new URL('/w/api.php',host);url.search=new URLSearchParams({action:'query',format:'json',formatversion:'2',...params});const response=await fetcher(url.href,{headers,signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Photo source unavailable');return response.json();}
export async function playerPhotos(players,{fetcher=fetch}={}){
 const requested=[...new Set(players.map(p=>playerArticle(p.name)).filter(Boolean))];if(!requested.length)return new Map();
 return articlePhotos(requested,{fetcher});
}
export async function articlePhotos(titles,{fetcher=fetch,width=480,stadiumOnly=false}={}){
 const requested=[...new Set(titles.filter(t=>typeof t==='string'&&t.length<=180&&!/[|\r\n]/.test(t)))];if(!requested.length)return new Map();
 const payload=await query('https://en.wikipedia.org',{prop:stadiumOnly?'pageimages|description':'pageimages',titles:requested.join('|'),redirects:'1',piprop:'thumbnail|name',pithumbsize:String(width),pilicense:'free'},fetcher);
 const pages=payload.query?.pages||[], images=pages.filter(p=>safePhoto(p.thumbnail?.source)&&p.pageimage&&(!stadiumOnly||/stadium|football ground|sports ground|arena/i.test(p.description||'')));
 if(!images.length)return new Map();
 const credits=await query('https://commons.wikimedia.org',{prop:'imageinfo',titles:images.map(p=>'File:'+p.pageimage).join('|'),iiprop:'extmetadata|url'},fetcher);
 const fileKey=value=>value.replace(/_/g,' ');
 const files=new Map((credits.query?.pages||[]).map(p=>[fileKey(p.title),p.imageinfo?.[0]]));
 const result=new Map(), mappings=[...(payload.query?.normalized||[]),...(payload.query?.redirects||[])];
 for(const title of requested){let canonical=title;for(let i=0;i<4;i++){const redirect=mappings.find(r=>r.from===canonical);if(!redirect)break;canonical=redirect.to;}
   const page=images.find(p=>p.title===canonical), info=page&&files.get(fileKey('File:'+page.pageimage)), source=safePhotoCredit(info?.descriptionurl), author=text(info?.extmetadata?.Attribution?.value||info?.extmetadata?.Artist?.value),license=text(info?.extmetadata?.LicenseShortName?.value);
   if(page&&source&&author&&license)result.set(title,{url:safePhoto(page.thumbnail.source),source,author,license,article:'https://en.wikipedia.org/wiki/'+encodeURIComponent(page.title.replace(/ /g,'_'))});
 }
 return result;
}
export async function filePhotos(files,{fetcher=fetch,width=1280}={}){
 const requested=[...new Set(files.filter(f=>typeof f==='string'&&f.length<=180&&!/[|\r\n]/.test(f)))];
 if(!requested.length)return new Map();
 const payload=await query('https://commons.wikimedia.org',{prop:'imageinfo',titles:requested.map(f=>'File:'+f).join('|'),iiprop:'extmetadata|url',iiurlwidth:String(width)},fetcher);
 const result=new Map();
 for(const page of payload.query?.pages||[]){const info=page.imageinfo?.[0],url=safePhoto(info?.thumburl||info?.url),source=safePhotoCredit(info?.descriptionurl),author=text(info?.extmetadata?.Attribution?.value||info?.extmetadata?.Artist?.value),license=text(info?.extmetadata?.LicenseShortName?.value);if(url&&source&&author&&license)result.set(page.title.slice(5).replace(/_/g,' '),{url,source,author,license});}
 return result;
}
export async function enrichPlayerPhotos(team,previous,{fetcher=fetch}={}){
 let photos;try{photos=await playerPhotos(team.squad,{fetcher});}catch{photos=new Map();}
 return {...team,squad:team.squad.map(player=>{const old=previous?.squad.find(p=>p.id===player.id&&p.name===player.name)?.photo;return {...player,photo:photos.get(playerArticle(player.name))||(old&&safePhoto(old.url)&&safePhotoCredit(old.source)?old:null)};})};
}
