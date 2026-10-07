import {playerArticle} from '../public/photos.js';
const clean=value=>String(value||'').replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi,'').replace(/<ref\b[^>]*\/>/gi,'').replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,'$2').replace(/\[\[([^\]]+)\]\]/g,'$1').replace(/\{\{[^{}]*\}\}/g,'').replace(/<[^>]*>/g,'').replace(/'{2,}/g,'').trim().slice(0,160);
export function parsePlayerProfile(page,checkedAt){
 if(page.missing||Object.hasOwn(page.pageprops||{},'disambiguation'))return null;
 const raw=page.revisions?.[0]?.slots?.main?.content;if(typeof raw!=='string'||!/\{\{\s*Infobox football biography/i.test(raw))return null;
 const field=name=>new RegExp('^\\|\\s*'+name+'\\s*=([^\\n]*)','im').exec(raw)?.[1]?.trim()||'';
 const birth=/\{\{\s*birth date(?: and age)?\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i.exec(field('birth_date'));
 let born=null;if(birth){const iso=`${birth[1]}-${birth[2].padStart(2,'0')}-${birth[3].padStart(2,'0')}`,date=new Date(iso+'T00:00:00Z');if(Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso)born=iso;}
 const heightRaw=field('height'),height=/\{\{\s*height\s*\|\s*m\s*=\s*(\d\.\d{1,2})/i.exec(heightRaw)||/(\d\.\d{1,2})\s*m\b/i.exec(heightRaw);
 const heightMeters=height&&Number(height[1])>=1.3&&Number(height[1])<=2.3?Number(height[1]):null;
 const clubRaw=field('currentclub'),club=clean(clubRaw),barca=/\[\[\s*FC Barcelona(?:\s*\||\s*\]\])/i.test(clubRaw);
 const number=/^(\d{1,2})(?:\s|<|$)/.exec(field('clubnumber'));
 const shirtNumber=barca&&number&&Number(number[1])>0?Number(number[1]):null;
 return {born,birthplace:clean(field('birth_place'))||null,heightMeters,position:clean(field('position'))||null,currentClub:club||null,shirtNumber,clubNumber:number&&Number(number[1])>0?Number(number[1]):null,
  source:'Wikipedia',sourceUrl:'https://en.wikipedia.org/wiki/'+encodeURIComponent(page.title.replaceAll(' ','_')),checkedAt};
}
export async function enrichPlayerProfiles(team,previous,{fetcher=fetch,now=Date.now()}={}){
 const titles=[...new Set(team.squad.map(player=>playerArticle(player.name)).filter(Boolean))],profiles=new Map();
 try{
  if(titles.length){
   const url=new URL('https://en.wikipedia.org/w/api.php');url.search=new URLSearchParams({action:'query',format:'json',formatversion:'2',prop:'revisions|pageprops',rvprop:'content',rvslots:'main',titles:titles.join('|'),redirects:'1'});
   const response=await fetcher(url,{headers:{'User-Agent':'BarcaMatchday/2.4 (independent football companion; Wikipedia source links in profiles)'},signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('Player biographies unavailable');const payload=await response.json(),mappings=[...(payload.query?.normalized||[]),...(payload.query?.redirects||[])];
   for(const title of titles){let canonical=title;for(let i=0;i<4;i++){const redirect=mappings.find(mapping=>mapping.from===canonical);if(!redirect)break;canonical=redirect.to;}
    const page=payload.query?.pages?.find(page=>page.title===canonical);if(page){const profile=parsePlayerProfile(page,new Date(now).toISOString());if(profile)profiles.set(title,profile);}
   }
  }
 }catch{} // Keep saved biography facts if Wikipedia is temporarily unavailable.
 return {...team,squad:team.squad.map(player=>{const old=previous?.squad?.find(p=>p.id===player.id&&p.name===player.name)?.profile;
  const profile=profiles.get(playerArticle(player.name))||old||null;
  return {...player,profile,shirtNumber:player.shirtNumber||profile?.shirtNumber||null,shirtNumberSource:player.shirtNumber?'football-data.org':profile?.shirtNumber?'Wikipedia':null};
 })};
}
