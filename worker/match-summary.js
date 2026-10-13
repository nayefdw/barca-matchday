const API='https://api-fcb.pulselive.com/football';
const INDEX='official_fixture_index',CACHE='match_summaries';
const minute=60000,hour=60*minute;
const clean=value=>typeof value==='string'?value.replace(/[\u0000-\u001f]/g,'').trim().slice(0,120):'';
function clubKey(value){
 const key=clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(fc|cf|sk|afc|club|de|ud|rcd|cd)\b/g,'').replace(/[^a-z0-9]/g,'');
 return {realbetisbalompie:'realbetis',realracingsantander:'racingsantander',athletic:'athleticbilbao',parissaintgermainfootball:'parissaintgermain'}[key]||key;
}
const competition=f=>f.gameweek?.compSeason?.competition?.id===21?'PD':f.gameweek?.compSeason?.competition?.id===2?'CL':null;
function sameClub(local,official){
 if(local.id===81)return official?.id===49;
 if(!official||official.id===49)return false;
 const localKeys=[local.name,local.shortName].filter(Boolean).map(clubKey);
 return [official.name,official.shortName,official.club?.name,official.club?.shortName].filter(Boolean).some(name=>localKeys.includes(clubKey(name)))
  || typeof local.tla==='string'&&local.tla.length>=3&&local.tla===official.club?.abbr;
}
export function matchOfficialFixture(fixture,records){
 const kickoff=Date.parse(fixture.kickoffUtc);
 const matches=records.filter(record=>competition(record)===fixture.competition&&record.teams?.length===2&&sameClub(fixture.homeTeam,record.teams[0].team)&&sameClub(fixture.awayTeam,record.teams[1].team)&&Number.isFinite(record.kickoff?.millis)&&
  (fixture.timeConfirmed?Math.abs(record.kickoff.millis-kickoff)<=90*minute:new Date(record.kickoff.millis).toISOString().slice(0,10)===fixture.kickoffUtc.slice(0,10)));
 return matches.length===1?matches[0]:null;
}
const STAT_DEFS=[['possession','Possession','possession_percentage','%'],['shots','Shots','total_scoring_att',''],['onTarget','Shots on target','ontarget_scoring_att',''],['corners','Corners','won_corners',''],['passes','Passes','total_pass',''],['passAccuracy','Pass accuracy',null,'%'],['fouls','Fouls','fk_foul_lost',''],['yellow','Yellow cards','total_yel_card',''],['red','Red cards','total_red_card',''],['offsides','Offsides','total_offside',''],['saves','Saves','saves','']];
export function normalizeOfficialSummary(local,record,statistics,now=Date.now()){
 if(!matchOfficialFixture(local,[record])||!Number.isInteger(record.id)||record.id<=0)return null;
 const status={U:'TIMED',L:record.phase==='H'?'PAUSED':'IN_PLAY',C:'FINISHED',P:'POSTPONED'}[record.status];
 if(!status||local.status==='FINISHED'&&status!=='FINISHED')return null;
 const values=record.teams.map(team=>Number.isInteger(team.score)&&team.score>=0&&team.score<100?team.score:null);
 const players=new Map();for(const list of record.teamLists||[])for(const player of [...(list.lineup||[]),...(list.substitutes||[])])players.set(player.id,clean(player.name?.display));
 const scorers=(record.events||[]).filter(event=>['G','P','O'].includes(event.type)&&record.teams.some(team=>team.team.id===event.teamId)).map(event=>({
  team:event.teamId===record.teams[0].team.id?'home':'away',name:players.get(event.personId)||'Scorer not supplied',minute:clean(event.clock?.label?.split("'")[0]||'').replace(/^0+(?=\d)/,'')+"'",type:event.type==='O'?'own-goal':event.type==='P'?'penalty':'goal',seconds:Number.isFinite(event.clock?.secs)?event.clock.secs:null
 }));
 const validStats=statistics?.entity?.id===record.id&&matchOfficialFixture(local,[statistics.entity]);
 const statsFor=id=>new Map((validStats?statistics.data?.[id]?.M||[]:[]).filter(row=>typeof row.name==='string'&&Number.isFinite(row.value)&&row.value>=0&&row.value<=1000000).map(row=>[row.name,row.value]));
 const home=statsFor(record.teams[0].team.id),away=statsFor(record.teams[1].team.id);
 const accuracy=stats=>stats.get('total_pass')>0&&stats.has('accurate_pass')?Math.round(stats.get('accurate_pass')/stats.get('total_pass')*1000)/10:null;
 const stats=STAT_DEFS.map(([key,label,name,unit])=>({key,label,unit,home:key==='passAccuracy'?accuracy(home):home.get(name)??null,away:key==='passAccuracy'?accuracy(away):away.get(name)??null})).map(row=>row.unit==='%'?{...row,home:row.home>100?null:row.home,away:row.away>100?null:row.away}:row).filter(row=>row.home!==null||row.away!==null);
 return {schemaVersion:1,matchId:local.id,kickoffUtc:new Date(record.kickoff.millis).toISOString(),status,score:{home:values[0],away:values[1],duration:record.shootout?'PENALTY_SHOOTOUT':record.extraTime?'EXTRA_TIME':'REGULAR',penalties:null},scorers,stats,clock:clean(record.clock?.label?.split("'")[0]||''),venue:clean(record.ground?.name)||null,checkedAt:new Date(now).toISOString(),source:'FC Barcelona',sourceUrl:`https://www.fcbarcelona.com/en/matches/${record.id}/match`,officialId:record.id};
}
async function readJson(path,fetcher){
 const response=await fetcher(API+path,{headers:{Origin:'https://www.fcbarcelona.com'},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('Official match source unavailable');
 const text=await response.text();if(text.length>2000000)throw new Error('Official response too large');return JSON.parse(text);
}
export async function loadMatchSummary(env,fixture,{now=Date.now(),fetcher=fetch,force=false}={}){
 const summaries=await env.FIXTURES.get(CACHE,'json')||{},saved=summaries[fixture.id];
 const ttl=['FINISHED','AWARDED'].includes(saved?.status)?6*hour:minute;
 if(saved&&!force&&now-Date.parse(saved.checkedAt)<ttl)return saved;
 if(saved?.retryAfterAt&&now<Date.parse(saved.retryAfterAt))return saved;
 try{
  let index=await env.FIXTURES.get(INDEX,'json');
  if(!index||now-Date.parse(index.checkedAt)>6*hour){
   const result=await readJson('/fixtures?teams=49&pageSize=100&sort=desc&altIds=true',fetcher);
   if(!Array.isArray(result.content)||result.content.length>100||result.content.some(f=>!f.teams?.some(team=>team.team?.id===49)))throw new Error('Invalid official fixture index');
   index={checkedAt:new Date(now).toISOString(),fixtures:result.content};await env.FIXTURES.put(INDEX,JSON.stringify(index));
  }
  const mapped=matchOfficialFixture(fixture,index.fixtures);if(!mapped)throw new Error('Official match not matched');
  const record=await readJson('/fixtures/'+mapped.id,fetcher);let stats=null;
  if(['L','C'].includes(record.status))try{stats=await readJson('/stats/match/'+mapped.id+'?altIds=true',fetcher);}catch{}
  const summary=normalizeOfficialSummary(fixture,record,stats,now);if(!summary)throw new Error('Invalid official match');
  summaries[fixture.id]=summary;
  const kept=Object.fromEntries(Object.entries(summaries).sort((a,b)=>Date.parse(b[1].checkedAt)-Date.parse(a[1].checkedAt)).slice(0,60));
  await env.FIXTURES.put(CACHE,JSON.stringify(kept));return summary;
 }catch{
  const fallback={...saved,schemaVersion:1,matchId:fixture.id,unavailable:!saved,stale:!!saved,retryAfterAt:new Date(now+5*minute).toISOString()};
  summaries[fixture.id]=fallback;await env.FIXTURES.put(CACHE,JSON.stringify(summaries));return fallback;
 }
}
export function applyMatchSummary(fixture,summary,now=Date.now()){
 if(summary?.matchId!==fixture.id||summary.unavailable||!summary.status||!summary.score)return fixture;
 if(fixture.status==='FINISHED'&&summary.status!=='FINISHED')return fixture;
 const difference=Math.abs(Date.parse(fixture.kickoffUtc)-Date.parse(summary.kickoffUtc));
 if(!Number.isFinite(difference)||difference>90*minute)return fixture;
 const score=summary.score.home===null||summary.score.away===null?fixture.score:{...summary.score,penalties:summary.score.penalties||fixture.score?.penalties||null};
 const updated={...fixture,status:summary.status,score,venue:summary.venue||fixture.venue,source:summary.source,sourceUpdatedAt:summary.checkedAt,matchClock:summary.clock,summaryFinalAt:fixture.summaryFinalAt||(summary.status==='FINISHED'?new Date(now).toISOString():null)};
 const signature=record=>JSON.stringify({home:record.homeTeam.name,away:record.awayTeam.name,competition:record.competitionName,start:record.calendarStart,date:record.calendarDate,status:record.status,venue:record.venue,round:record.round});
 updated.calendarSignature=signature(updated);
 const changed=updated.calendarSignature!==(fixture.calendarSignature||signature(fixture));
 updated.sequence=(fixture.sequence||0)+(changed?1:0);updated.changedAt=changed?summary.checkedAt:fixture.changedAt;
 return updated;
}
export async function updateLiveMatches(env,{now=Date.now(),fixtures=[],force=false,fetcher=fetch}={}){
 const snapshot=await env.FIXTURES.get('snapshot','json');if(!snapshot||snapshot.demo)return {skipped:'no-real-fixtures'};
 let changed=false;for(const id of fixtures){const fixture=snapshot.fixtures.find(f=>f.id===id);if(!fixture)continue;const summary=await loadMatchSummary(env,fixture,{now,force,fetcher});const updated=applyMatchSummary(fixture,summary,now);if(updated!==fixture){snapshot.fixtures[snapshot.fixtures.indexOf(fixture)]=updated;changed=true;}}
 if(changed){snapshot.liveCheckedAt=new Date(now).toISOString();await env.FIXTURES.put('snapshot',JSON.stringify(snapshot));}return {updated:changed};
}
export async function summaryResponse(request,env,{now=Date.now(),fetcher=fetch}={}){
 const id=new URL(request.url).searchParams.get('match');if(!/^fd-\d+$/.test(id||''))return Response.json({error:'Invalid match'},{status:400});
 const snapshot=await env.FIXTURES.get('snapshot','json'),fixture=snapshot?.fixtures?.find(f=>f.id===id);
 if(!fixture||snapshot.demo)return Response.json({error:'Match unavailable'},{status:404});
 const summary=request.method==='HEAD'?null:await loadMatchSummary(env,fixture,{now,fetcher});
 return new Response(summary?JSON.stringify(summary):null,{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}
