import {TIME_ZONES,deviceTimezone,timezonePreference,resolveTimezone,timezoneLabel} from './timezones.js';
import {countdownClock,livePresentation,clockFormat} from './match-display.js';
import {installPullRefresh} from './pull-refresh.js';
import {bounded,startPushSubscription,notificationError} from './notifications.js';
import {COMPETITION_BADGES} from './competitions.js';
import {photoLibrary,loadPhotoLibrary,activeHomePhotos,savePhotoPreferences,addHomePhoto,removeHomePhoto} from './photo-library.js';
import {CURATED_STADIUMS,safeStadium,matchVenue,safeVenue} from './stadiums.js';
import { upcoming, currentMatch, stateLabel, opponent, place } from './state.js';
import { nearbyFixtures, posterState } from './poster.js';
import { recentMeetings, meetingOutcome } from './history.js';
import { safeCrest } from './teams.js';
import { safePhoto, safePhotoCredit } from './photos.js';
import { finishedFixtures, recentForm, matchResult, countdownParts, dateKey, monthCalendar, shiftMonth, searchFixtures, trackedStats } from './insights.js';

const $ = selector => document.querySelector(selector);
const e = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h2m4 0h2"/>',
  refresh:'<path d="M20 11a8 8 0 1 0-2 7M20 4v7h-7"/>', arrow:'<path d="m9 5 7 7-7 7"/>',
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1"/>',
  settings:'<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="5"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>', pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.2"/>',
  share:'<path d="M12 16V3m-4 4 4-4 4 4M7 11H4v10h16V11h-3"/>', external:'<path d="M14 3h7v7m0-7-11 11M9 3H3v18h18v-6"/>',
  trophy:'<path d="M8 3h8v7a4 4 0 0 1-8 0V3ZM8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v6m-4 0h8"/>',
  shirt:'<path d="m8 3-6 4 3 5 3-1v10h8V11l3 1 3-5-6-4a4 4 0 0 1-8 0Z"/>', stats:'<path d="M4 21V11h4v10m2 0V3h4v18m2 0V7h4v14"/>', bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-11 12a2 2 0 0 0 4 0"/>', news:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h4v4H7zm8 0h2m-2 4h2M7 16h10"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
let stadiumData={...CURATED_STADIUMS},venueData={},stadiumRefreshing=false;
function venueLabel(f){const venue=matchVenue(f,venueData);return venue?venue.name:'Venue not supplied';}
function venueNote(f){const venue=matchVenue(f,venueData);return venue&&!venue.confirmed?'<p class="sheet-note">The fixture feed omits the match venue. This is the home club’s listed ground; a venue change is still possible.</p>':'';}
let homePhotoIndex=0,homePhotoBusy=false,homePhotoGeneration=0;
await loadPhotoLibrary();
let photoSaving=false;
function currentHomePhoto(){const photos=activeHomePhotos();return photos[homePhotoIndex%photos.length]||null;}
function homePhotoControl(){const photos=activeHomePhotos();return photos.length>1?`<button class="home-photo-control" data-action="next-photo" aria-label="Next home background photo"><span class="photo-dots" aria-hidden="true">${photos.map((_,index)=>`<i class="${index===homePhotoIndex?'active':''}"></i>`).join('')}</span><span class="photo-number">${homePhotoIndex+1} / ${photos.length}</span><span>Next photo ${icon('arrow')}</span></button>`:'';}

const pages = ['match','news','squad','stats','fixtures','calendar','settings'];
const primaryPages = ['match','news','squad','stats'];
let data=null, teamData=null, page='match';
history.replaceState(null,'',location.pathname+location.search+'#match');
let tableData={},tableCompetition='PD',tableRefreshing=false,tableFailed={};
let pushConfig=null,pushEnabled=false,pushBusy=false,pushLoading=false,pushRegistration=null,pushSubscription=null,pushMessage='',reminderMinutes=60;
let refreshTask=null,refreshStatus='';
try{const lead=Number(localStorage.getItem('cartel-reminder'));if([15,30,60,120,1440].includes(lead))reminderMinutes=lead;}catch{}
let competition='all', fixtureView='upcoming', query='', squadFilter='All', refreshing=false, teamRefreshing=false, teamFailed=false, offline=false, toastTimer;
let timeFormat='24';
try{if(localStorage.getItem('cartel-time-format')==='12')timeFormat='12';}catch{}
let timezone='local', calendarYear, calendarMonth, selectedDay=null, sharedOpened=false;
try { timezone=timezonePreference(localStorage.getItem('cartel-timezone')); } catch {}
const tz = () => resolveTimezone(timezone);
let renderedTimezone=tz();
function syncDeviceTimezone(){const zone=tz();if(zone!==renderedTimezone){renderedTimezone=zone;selectedDay=null;render();}}
const date = (value,options) => new Intl.DateTimeFormat('en-GB',{timeZone:tz(),...clockFormat(options,timeFormat)}).format(new Date(value)).replace(/\b(am|pm)\b/gi,value=>value.toUpperCase());
function fixtureDate(f,options){return f.timeConfirmed?date(f.kickoffUtc,options):new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',...options}).format(new Date(f.kickoffUtc.slice(0,10)+'T12:00:00Z'));}
function fixtureWhen(f,options={dateStyle:'medium',timeStyle:'short'}){return f.timeConfirmed?date(f.kickoffUtc,options):fixtureDate(f,{dateStyle:options.dateStyle||'medium'})+' · Kickoff time pending';}
const tzName = () => timezoneLabel(timezone);
function initMonth(){const [year,month]=dateKey(Date.now(),tz()).split('-').map(Number);calendarYear=year;calendarMonth=month;}
initMonth();
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function shield(team,tiny=false){
  const url=safeCrest(team.crest);
  return `<span class="crest-shell ${tiny?'tiny-crest':''}" role="img" aria-label="${e(team.name)} crest"><span class="shield ${team.id===81?'':'other'}">${e(team.tla || 'FC')}</span>${url?`<img class="club-crest" src="${e(url)}" alt="" decoding="async" referrerpolicy="no-referrer" width="72" height="80">`:''}</span>`;
}
document.addEventListener('load',event=>{if(event.target.matches?.('.club-crest'))event.target.closest('.crest-shell').classList.add('crest-loaded');},true);
document.addEventListener('error',event=>{if(event.target.matches?.('.club-crest'))event.target.closest('.crest-shell').classList.remove('crest-loaded');if(event.target.matches?.('.stadium-art'))event.target.hidden=true;},true);
const filtered = fixtures => fixtures.filter(f=>competition==='all'||f.competition===competition);
const resultBadge = f => {const r=matchResult(f);return r?`<span class="result-badge result-${r.outcome}" aria-label="${{W:'Win',D:'Draw',L:'Loss'}[r.outcome]}">${r.outcome}</span>`:'';};
function row(f,highlight=false){
  const result=matchResult(f), cancelled=['CANCELLED','POSTPONED'].includes(f.status), confirmed=f.timeConfirmed;
  return `<button class="fixture-row ${highlight?'highlight':''}" data-match="${e(f.id)}"><span class="date-tile">${e(fixtureDate(f,{month:'short'}))}<strong>${e(fixtureDate(f,{day:'numeric'}))}</strong></span>${shield(opponent(f),true)}<span class="fixture-info"><strong>${e(opponent(f).name)}</strong><span>${e(place(f))} <i>·</i> ${e(f.competitionName)}</span></span><span class="row-time">${result?`${f.score.home}–${f.score.away}`:confirmed?e(date(f.kickoffUtc,{hour:'2-digit',minute:'2-digit'})):'TBC'}<small>${result?'Full time':cancelled?e(f.status==='CANCELLED'?'Cancelled':'Postponed'):confirmed?e(date(f.kickoffUtc,{weekday:'short'})):'Time pending'}</small></span>${resultBadge(f)}</button>`;
}
function competitionChips(){return `<div class="filters" aria-label="Competition filters">${[['all','All'],['PD','La Liga'],['CL','Champions League']].map(([value,label])=>`<button class="chip" data-competition="${value}" aria-pressed="${competition===value}">${label}</button>`).join('')}</div>`;}
function pageHeading(kicker,title,description=''){return `<div class="page-heading"><span class="eyebrow">${e(kicker)}</span><h1>${e(title)}</h1>${description?`<p>${e(description)}</p>`:''}</div>`;}
function calendarBanner(){return `<button class="calendar-banner" data-action="calendar">${icon('calendar')}<span><strong>Keep kickoff in your calendar</strong><small>Subscribe once. Stay up to date.</small></span>${icon('arrow')}</button>`;}
function timer(f){
  const parts=countdownClock(f);
  if(!parts)return `<div class="match-status">${icon('clock')} ${e(stateLabel(f))}</div>`;
  const values=[['days','Days'],['hours','Hours'],['minutes','Min'],['seconds','Sec']];
  return `<div class="countdown-clock" role="timer" aria-label="${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes, ${parts.seconds} seconds until kickoff">${values.map(([key,label])=>`<span><strong>${String(parts[key]).padStart(2,'0')}</strong><small>${label}</small></span>`).join('')}</div>`;
}
let posterShown=false;
function hero(f,preview=false){
  const state=posterState(f,Date.now(),tz()),home=f.homeTeam.id===81;
  if(preview&&!state.live&&!state.finished&&!state.unavailable&&!state.today)state.title=home?'Home match':'Away match';
  const entrance=posterShown?'':'poster-enter';posterShown=true;
  const live=livePresentation(f),score=(state.finished||state.live)&&live.hasScore,scoreVisible=score||live.active;
  const canAdd=(f.timeConfirmed||f.status==='SCHEDULED')&&!state.unavailable&&!data.demo;
  const subtitle=state.finished||state.live?'Result may be delayed':tzName();
  const stadium=home?null:safeStadium(stadiumData[f.homeTeam.id]),background=home?currentHomePhoto()?.url:stadium?.photo.url||null;
  const badge=COMPETITION_BADGES[f.competition];
  const photoStyle=background?` style="--stadium-image:url('${e(background.replace(/['"\\<>]/g,c=>'%'+c.charCodeAt(0).toString(16)))}')"`:'';
  return `<article aria-label="${e(f.homeTeam.name)} vs ${e(f.awayTeam.name)} match poster" class="match-card poster-banner ${entrance} ${home?'home-game':'away-game'} tone-${state.tone} ${state.today?'is-matchday':''} ${state.unavailable?'unavailable-match':''}" data-match-id="${e(f.id)}"><div class="poster-scene ${home?'home-collection':stadium?'has-stadium':'generic-stadium'}"${photoStyle} aria-hidden="true">${background?`<img class="stadium-art" src="${e(background)}" alt="" referrerpolicy="no-referrer" fetchpriority="high">`: ""}<div class="sky-tint"></div><div class="flag-blur blue"></div><div class="flag-blur red"></div></div><div class="match-wash"></div><div class="match-top"><span class="league-badge competition-badge ${f.competition==='CL'?'cl-badge':''}" aria-label="${e(f.competitionName)}">${badge?`<img class="competition-logo" src="${e(badge.url)}" alt="" referrerpolicy="no-referrer" width="30" height="30">`:''}<span>${e(f.competitionName)}</span></span><button class="icon-button share-button" data-share="${e(f.id)}" aria-label="Share match">${icon('share')}</button></div><div class="home-match-label">${home?'HOME MATCH · BARCELONA':'AWAY MATCH'}</div>${live.active?`<div class="live-pill" role="status"><i></i>${live.label}<small>Delayed score</small></div>`:''}<div class="teams-duel"><div><span class="team-roundel">${shield(f.homeTeam)}</span><h2>${e(f.homeTeam.name)}</h2></div><span class="versus ${scoreVisible?'duel-score':''}">${scoreVisible?e(live.score):'VS'}</span><div><span class="team-roundel">${shield(f.awayTeam)}</span><h2>${e(f.awayTeam.name)}</h2></div></div><div class="kickoff ${state.unavailable?'struck-time':''}">${scoreVisible?'':f.timeConfirmed?e(date(f.kickoffUtc,{hour:'2-digit',minute:'2-digit'})):'Time TBC'}</div><p class="match-date">${e(fixtureDate(f,{weekday:'long',day:'numeric',month:'short'}))}</p><p class="match-venue">${icon('pin')}${e(venueLabel(f))}</p>${live.active||!f.timeConfirmed&&!state.unavailable?'':`<div class="countdown" data-countdown="${e(f.id)}" aria-live="off">${timer(f)}</div>`}<div class="hero-actions"><button class="primary" data-match="${e(f.id)}">Details ${icon('arrow')}</button>${canAdd?`<a class="secondary" href="/calendar/match/${encodeURIComponent(f.id)}.ics">${icon('calendar')} Add to calendar</a>`:`<button class="secondary" data-action="calendar">${icon('calendar')} Calendar</button>`}</div><p class="hero-footnote">${e(subtitle)} · La Liga & Champions League<br>Cups not tracked</p>${home?homePhotoControl():stadium?`<button class="poster-photo-credit" data-stadium="${f.homeTeam.id}">${e(stadium.name)} · Photo credit</button>`:''}</article>`;
}
function miniMatch(f,label){
  const result=matchResult(f),cancelled=['POSTPONED','CANCELLED'].includes(f.status);
  return `<button class="mini-match" data-match="${e(f.id)}"><span class="eyebrow">${e(label)} ${icon('arrow')}</span><div class="mini-top">${shield(opponent(f),true)}</div><strong class="mini-opponent">${e(opponent(f).name)}</strong><div class="mini-result">${result?`<strong>${f.score.home}–${f.score.away}</strong>${resultBadge(f)}`:f.timeConfirmed?`<span class="mini-kickoff">${e(date(f.kickoffUtc,{hour:'2-digit',minute:'2-digit'}))}</span>`:'<span class="mini-kickoff">TBC</span>'}</div><small class="${cancelled?'struck-time':''}">${e(fixtureDate(f,{weekday:'short',day:'numeric',month:'short'}))}</small><small>${e(f.competitionName)}</small><span class="venue-pill">${e(place(f))}</span>${cancelled?`<span class="mini-status">${e(f.status==='POSTPONED'?'Postponed':'Cancelled')}</span>`:!result&&Date.parse(f.kickoffUtc)<=Date.now()?'<span class="mini-status">Result unavailable</span>':''}</button>`;
}
function formPanel(fixtures){
  const form=recentForm(fixtures);
  return `<section class="form-panel floating-card"><div><span class="eyebrow">RECENT FORM</span><small>${form.length?`${form.length} tracked ${form.length===1?'result':'results'}`:'Awaiting results'}</small></div><div class="form-dots">${form.map(r=>`<button class="form-dot result-${r.outcome}" data-match="${e(r.fixture.id)}" aria-label="${e(opponent(r.fixture).name)}: ${r.outcome==='W'?'win':r.outcome==='D'?'draw':'loss'}">${r.outcome}</button>`).join('')||'<span class="muted">—</span>'}</div></section>`;
}
function renderMatch(){
  const next=upcoming(data.fixtures), previous=finishedFixtures(data.fixtures)[0], focus=currentMatch(data.fixtures)||next[0]||previous;
  if(!focus)return emptyView();
  const nearby=nearbyFixtures(data.fixtures,focus);
  return `<section class="home-content">${hero(focus)}<div class="match-strip" style="--columns:${nearby.length}" aria-label="Nearby fixtures">${nearby.map(item=>miniMatch(item.fixture,item.label)).join('')}</div>${formPanel(data.fixtures)}${calendarBanner()}<p class="coverage-line"><i class="competition-dot"></i>La Liga <i class="competition-dot europe"></i>Champions League <span>· Cups not tracked</span></p></section>`;
}
function fixtureList(){
  const base=fixtureView==='results'?finishedFixtures(data.fixtures):upcoming(data.fixtures);
  const list=searchFixtures(filtered(base),query), current=currentMatch(data.fixtures);
  let last='', html='';
  for(const f of list){const group=f.status==='POSTPONED'?'Postponed':fixtureDate(f,{month:'long',year:'numeric'});if(group!==last){html+=`<h2 class="month-heading">${e(group)}</h2>`;last=group;}html+=row(f,fixtureView==='upcoming'&&f===list[0]);}
  const showCurrent=fixtureView==='upcoming'&&current&&filtered([current]).length&&searchFixtures([current],query).length;
  return `${showCurrent?`<div class="status-card"><p>${e(stateLabel(current))}</p>${row(current)}</div>`:''}${html||'<div class="empty-list"><p>No matching fixtures.</p><small>Try another opponent or competition.</small></div>'}`;
}
function renderFixtures(){return `<section class="content">${pageHeading('EVERY TRACKED MATCH','Fixtures','Your season, at a glance.')}<div class="segmented" role="tablist" aria-label="Fixture view">${[['upcoming','Upcoming'],['results','Results']].map(([value,label])=>`<button role="tab" data-fixture-view="${value}" aria-selected="${fixtureView===value}">${label}</button>`).join('')}</div><label class="search-field">${icon('search')}<input id="fixture-search" type="search" placeholder="Search opponent or competition" aria-label="Search fixtures" value="${e(query)}" autocomplete="off"></label>${competitionChips()}<div id="fixture-list">${fixtureList()}</div>${calendarBanner()}<p class="sheet-note">La Liga + Champions League. Cup fixtures are not tracked.</p></section>`;}

function calendarCell(day,monthLabel){
 const label=`${monthLabel} ${day.day}: ${day.fixtures.length} ${day.fixtures.length===1?'match':'matches'}${day.fixtures.map(f=>', '+opponent(f).name+', '+place(f)).join('')}`;
 return `<button class="calendar-day ${day.today?'is-today':''} ${day.fixtures.length?'has-fixture':''}" data-day="${day.key}" aria-pressed="${selectedDay===day.key}" aria-label="${e(label)}">${day.fixtures.length?`<small class="match-day-number">${day.day}</small><span class="calendar-badges">${day.fixtures.slice(0,2).map(f=>shield(opponent(f),true)).join('')}</span><i class="day-dots" aria-hidden="true">${day.fixtures.slice(0,3).map(f=>`<b class="${f.homeTeam.id===81?'home':'away'}"></b>`).join('')}</i>`:`<span>${day.day}</span>`}</button>`;
}

function renderCalendar(){
  const fixtures=data?.fixtures || [], model=monthCalendar(fixtures,{year:calendarYear,month:calendarMonth,timeZone:tz(),competition});
  const monthLabel=new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(Date.UTC(calendarYear,calendarMonth-1,15)));
  const inMonth=model.days.flatMap(day=>day.fixtures), selection=selectedDay?model.days.find(day=>day.key===selectedDay):null;
  const list=selection?selection.fixtures:inMonth;
  const homeCount=inMonth.filter(f=>f.homeTeam.id===81).length,awayCount=inMonth.length-homeCount;
  const pending=filtered(fixtures).filter(f=>f.status==='POSTPONED');
  return `<section class="content">${pageHeading('PLAN AROUND KICKOFF','Calendar',tzName()+'. Published fixture dates.')}<div class="calendar-toolbar"><button class="text-button" data-action="today">Today</button><button class="text-button" data-action="calendar">${icon('calendar')} Subscribe</button></div>${competitionChips()}<section class="month-card floating-card"><div class="month-controls"><button class="icon-button previous-arrow" data-month="-1" aria-label="Previous month">${icon('arrow')}</button><h2>${e(monthLabel)}</h2><button class="icon-button" data-month="1" aria-label="Next month">${icon('arrow')}</button></div><div class="weekdays">${['M','T','W','T','F','S','S'].map(day=>`<span>${day}</span>`).join('')}</div><div class="month-grid">${'<span class="blank-day" aria-hidden="true"></span>'.repeat(model.offset)}${model.days.map(day=>calendarCell(day,monthLabel)).join('')}</div><p class="month-legend"><i class="competition-dot"></i>Home <i class="competition-dot europe"></i>Away</p><p class="calendar-hint">Tap a crest to see the match. Pending kickoff times are marked TBC; published dates may change.</p></section><button class="month-summary floating-card" data-action="month-agenda" aria-label="Show all ${inMonth.length} matches this month"><span class="summary-calendar">${icon('calendar')}</span><span><strong>${inMonth.length} ${inMonth.length===1?'match':'matches'} this month</strong><small><i class="summary-home"></i>${homeCount} home <span>·</span> <i class="summary-away"></i>${awayCount} away</small></span>${icon('arrow')}</button><div class="section-header" id="month-agenda"><h2>${selection?`Matches · ${selection.day} ${monthLabel}`:'This month'} <small>${list.length}</small></h2>${selection?'<button class="text-button" data-action="clear-day">Show month</button>':''}</div>${list.map(f=>row(f)).join('')||'<div class="empty-list"><p>No match on these dates.</p></div>'}${pending.length?`<details class="earlier"><summary>Awaiting a new date <small>${pending.length}</small></summary>${pending.map(f=>row(f)).join('')}</details>`:''}${calendarBanner()}</section>`;
}
function renderNews(){return `<section class="content news-content">${pageHeading('FROM THE CLUB','News','Open the latest stories from FC Barcelona.')}<a class="news-hero floating-card" href="https://www.fcbarcelona.com/en/football/first-team/news" target="_blank" rel="noopener"><img src="https://upload.wikimedia.org/wikipedia/commons/2/2c/Campnoupano2011.jpg" alt="" referrerpolicy="no-referrer"><div><span class="source-pill"><i></i>Official club feed</span><h2>Inside Barça.</h2><p>Team updates, training and matchday stories.</p><span class="news-link">Read the latest ${icon('external')}</span></div></a><a class="news-source floating-card" href="https://www.fcbarcelona.com/en/club/news" target="_blank" rel="noopener"><span class="source-icon">${icon('news')}</span><span><small>FCBARCELONA.COM</small><h2>Club & community</h2><p>Everything beyond the pitch.</p></span>${icon('external')}</a><a class="news-source floating-card" href="https://www.fcbarcelona.com/en/football/first-team/results" target="_blank" rel="noopener"><span class="source-icon red">${icon('trophy')}</span><span><small>OFFICIAL MATCH CENTRE</small><h2>Results & reports</h2><p>Catch up on the latest matches.</p></span>${icon('external')}</a><p class="sheet-note">Stories open on the official club website, where they stay up to date.</p></section>`;}

function portrait(player){const photo=safePhoto(player.photo?.url);return `<span class="player-image ${photo?'has-photo':''}">${kit(player)}${photo?`<img class="player-photo" src="${e(photo)}" alt="${e(player.name)}" loading="lazy" referrerpolicy="no-referrer">`:''}</span>`;}
function photoCredit(player){const source=safePhotoCredit(player.photo?.source);return source?`<p class="photo-credit">Photo: ${e(player.photo.author)} · ${e(player.photo.license)}. Display cropped to fit. <a href="${e(source)}" target="_blank" rel="noopener">Source & licence ${icon('external')}</a></p>`:'';}
function tableStage(table,code){if(table.group)return table.group.replace(/_/g,' ').toLowerCase().replace(/^./,c=>c.toUpperCase());if(code==='PD')return 'League table';return table.stage==='LEAGUE_STAGE'||table.rows.length>16?'League phase':table.stage?table.stage.replace(/_/g,' ').toLowerCase().replace(/^./,c=>c.toUpperCase()):'Competition table';}
function renderCompetitionTables(){
 const snapshot=tableData[tableCompetition],table=snapshot?.tables[0],barca=table?.rows.find(r=>r.team.id===81);
 const switcher=`<div class="segmented table-tabs" role="tablist" aria-label="Competition tables">${[['PD','La Liga'],['CL','Champions League']].map(([code,label])=>`<button role="tab" data-table-competition="${code}" aria-selected="${tableCompetition===code}">${label}</button>`).join('')}</div>`;
 if(!table)return `${switcher}<div class="setting-card floating-card"><h2>${tableRefreshing?'Loading the table…':'Table not available yet'}</h2><p>Competition standings will appear when the saved data is ready.</p><button class="secondary" data-action="refresh-standings">Try again</button></div>`;
 return `${switcher}<section class="standings-card floating-card"><div class="table-heading"><span><span class="eyebrow">${e(tableStage(table,tableCompetition))}</span><h2>${e(snapshot.name)} <small>${e(snapshot.season||'')}</small></h2></span><span class="barca-rank">${barca.position}<small>BARÇA</small></span></div><p class="table-status">${snapshot.demo?'Illustrative table · sample teams':snapshot.stale||tableFailed[tableCompetition]||snapshot.refreshFailed?'Saved table · may be out of date':'Last checked '+e(date(snapshot.checkedAt,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))}</p><div class="standings-scroll" tabindex="0" role="region" aria-label="${e(snapshot.name)} standings"><table class="standings-table"><caption class="sr-only">${e(snapshot.name)} standings. Tap a club for its full numbers.</caption><thead><tr><th scope="col"><abbr title="Position">#</abbr></th><th scope="col">CLUB</th><th scope="col"><abbr title="Played">P</abbr></th><th scope="col"><abbr title="Goal difference">GD</abbr></th><th scope="col"><abbr title="Points">PTS</abbr></th></tr></thead><tbody>${table.rows.map(r=>`<tr class="${r.team.id===81?'barca-table-row':''}" data-table-team="${r.team.id}"><td>${r.position}</td><th scope="row"><button class="table-club" data-standing="${r.team.id}">${shield(r.team,true)}<span>${e(r.team.name)}</span></button></th><td>${r.played}</td><td>${r.goalDifference>0?'+':''}${r.goalDifference}</td><td class="table-points">${r.points}</td></tr>`).join('')}</tbody></table></div><div class="table-bottom"><span>${table.rows.length} ${snapshot.demo?'sample teams':'teams'}</span><button class="text-button" data-action="jump-barca">Jump to Barça ${icon('arrow')}</button></div></section><p class="sheet-note table-note">Tap a club for wins, draws, losses and goals. Cup competitions use knockout brackets and are not covered by this free source.</p>`;
}
function standingsDetails(id){const snapshot=tableData[tableCompetition],row=snapshot?.tables.flatMap(t=>t.rows).find(r=>String(r.team.id)===id);if(!row)return;sheet('Club statistics',`<div class="table-team-profile">${shield(row.team)}<h3>${e(row.team.name)}</h3><p>${e(snapshot.name)} · ${e(snapshot.season||'')}</p></div><dl class="details-grid">${[['POSITION',row.position],['POINTS',row.points],['PLAYED',row.played],['WINS',row.won],['DRAWS',row.draw],['LOSSES',row.lost],['GOALS FOR',row.goalsFor],['GOALS AGAINST',row.goalsAgainst],['GOAL DIFFERENCE',row.goalDifference>0?'+'+row.goalDifference:row.goalDifference]].map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><p class="sheet-note">${snapshot.demo?'Illustrative sample table.':'Official competition table supplied by football-data.org. May be delayed.'}</p>`);}
async function loadStandings(){
 if(tableRefreshing)return;const code=tableCompetition;tableRefreshing=true;if(page==='stats'&&!tableData[code])render();
 try{const response=await fetch('/api/standings?competition='+code,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const loaded=await response.json();if(loaded.schemaVersion!==1||loaded.competition!==code||!Array.isArray(loaded.tables)||!loaded.tables.length)throw new Error();tableData[code]=loaded;tableFailed[code]=!!loaded.offline;try{localStorage.setItem('cartel-tables',JSON.stringify(tableData));}catch{}}
 catch{tableFailed[code]=true;}finally{tableRefreshing=false;if(page==='stats')render();if(page==='stats'&&tableCompetition!==code)loadStandings();}
}
document.addEventListener('load',event=>{if(event.target.matches?.('.player-photo'))event.target.parentElement.classList.add('photo-loaded');},true);
document.addEventListener('error',event=>{if(event.target.matches?.('.player-photo'))event.target.remove();},true);

function playerGroup(player){const p=player.position.toLowerCase();return p.includes('goal')?'Goalkeepers':p.includes('def')||p.includes('back')?'Defenders':p.includes('mid')?'Midfielders':p.includes('off')||p.includes('forw')||p.includes('attack')||p.includes('wing')?'Forwards':'Other';}
function kit(player){return `<svg class="player-kit" viewBox="0 0 140 140" aria-hidden="true"><path d="m45 16-34 20 15 31 16-7v65h56V60l16 7 15-31-34-20a28 28 0 0 1-50 0Z" fill="#14529d" stroke="#6e95c1" stroke-width="1.1"/><path d="M52 27h16v96H52zm30 0h16v96H82z" fill="#a82953"/><path d="M47 16q23 27 46 0" stroke="#e8bc82" stroke-width="3" fill="none"/><text x="70" y="89" text-anchor="middle" fill="#f9eccf" font-family="system-ui,sans-serif" font-size="31" font-weight="800">${e(player.shirtNumber || player.name.split(' ').map(n=>n[0]).slice(0,2).join(''))}</text></svg>`;}
function renderSquad(){
  if(!teamData)return `<section class="content">${pageHeading('FIRST TEAM','Squad')}<div class="setting-card"><h2>${teamRefreshing?'Loading squad…':'Team data is not connected yet'}</h2><p>The season roster will appear once team data is available.</p><button class="secondary" data-action="refresh-team">Try again</button><a class="text-button" href="https://www.fcbarcelona.com/en/football/first-team/players" target="_blank" rel="noopener">View the official squad ${icon('external')}</a></div></section>`;
  const players=teamData.squad.filter(p=>squadFilter==='All'||playerGroup(p)===squadFilter);
  return `<section class="content">${pageHeading('FIRST TEAM','Squad',teamData.demo?'A sample selection for this design preview.':'The provider’s season roster.')}<div class="coach-card floating-card"><span class="source-icon">${icon('shirt')}</span><span><small>HEAD COACH</small><strong>${e(teamData.coach || 'To be confirmed')}</strong></span><span class="squad-count">${teamData.squad.length}<small>${teamData.demo?'sample players':'players'}</small></span></div>${teamData.stale||teamFailed?'<p class="inline-notice">Showing the last saved squad. It may be out of date.</p>':''}<div class="squad-filters" aria-label="Squad position filters">${['All','Goalkeepers','Defenders','Midfielders','Forwards'].map(value=>`<button class="chip" data-position="${value}" aria-pressed="${squadFilter===value}">${value}</button>`).join('')}</div><div class="player-grid">${players.map(p=>`<button class="player-card floating-card" data-player="${p.id}"><span class="player-number">${e(p.shirtNumber || '—')}</span>${portrait(p)}<strong>${e(p.name)}</strong><small>${e(p.position)}</small></button>`).join('')}</div><p class="sheet-note">Season rosters can include players who appeared earlier in the season. Availability and injuries are not included.</p><a class="secondary" href="https://www.fcbarcelona.com/en/football/first-team/players" target="_blank" rel="noopener">Official squad ${icon('external')}</a></section>`;
}
function playerDetails(id){
 const player=teamData?.squad.find(p=>String(p.id)===id);if(!player)return;const profile=player.profile;
 const born=profile?.born&&/^\d{4}-\d{2}-\d{2}$/.test(profile.born)?new Date(profile.born+'T00:00:00Z'):null;
 const birth=born&&Number.isFinite(born.getTime())?new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'}).format(born):null;
 let wikiUrl=null;try{const url=new URL(profile?.sourceUrl);if(url.protocol==='https:'&&url.hostname==='en.wikipedia.org'&&url.pathname.startsWith('/wiki/'))wikiUrl=url.href;}catch{}
 const number=player.shirtNumber?String(player.shirtNumber):profile?.clubNumber?profile.clubNumber+' · '+profile.currentClub:'Not available';
 const fields=[['SHIRT NUMBER',number],['NATIONALITY',player.nationality||'Not supplied'],['BORN',birth],['BIRTHPLACE',profile?.birthplace],['HEIGHT',profile?.heightMeters?profile.heightMeters.toFixed(2)+' m':null],['POSITION',profile?.position||player.position]];
 sheet('Player profile',`<div class="player-profile">${portrait(player)}${player.shirtNumber?`<span class="profile-shirt-number">#${e(player.shirtNumber)}</span>`:''}<h3>${e(player.name)}</h3><p>${e(profile?.position||player.position)}</p></div><dl class="details-grid">${fields.filter(([,value])=>value).map(([label,value])=>`<div><dt>${label}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>${wikiUrl?`<a class="secondary" href="${e(wikiUrl)}" target="_blank" rel="noopener">Wikipedia biography ${icon('external')}</a><p class="sheet-note">${player.shirtNumberSource==='Wikipedia'?'Shirt number and biography facts from Wikipedia.':'Biography facts from Wikipedia.'} ${profile?.currentClub?'Listed club: '+e(profile.currentClub)+'. ':''}Numbers can change.</p>`:''}${photoCredit(player)}<p class="sheet-note">${teamData.demo?'Sample selection for the design preview.':'Season roster supplied by football-data.org. Availability is not provided.'}</p><a class="primary" href="https://www.fcbarcelona.com/en/football/first-team/players" target="_blank" rel="noopener">View official squad ${icon('external')}</a>`);
}
function renderStats(){
  const fixtures=filtered(data.fixtures), stats=trackedStats(fixtures), games=finishedFixtures(fixtures), goals=stats.goalsFor+stats.goalsAgainst;
  return `<section class="content">${pageHeading('THE SEASON AT A GLANCE','Stats','Competition tables and the numbers behind the game.')} ${renderCompetitionTables()}<div class="section-header"><h2>Tracked results</h2></div>${competitionChips()}<section class="stats-lead floating-card"><span class="eyebrow">TRACKED MATCHES</span><strong>${stats.played}</strong><span class="win-rate">${stats.played?Math.round(stats.wins/stats.played*100)+'%':'—'}<small>win rate</small></span><div class="wdl"><span><b>${stats.wins}</b>Wins</span><span><b>${stats.draws}</b>Draws</span><span><b>${stats.losses}</b>Losses</span></div></section>${formPanel(fixtures)}<div class="stats-grid"><div class="stat-tile floating-card blue"><span>Goals scored</span><strong>${stats.goalsFor}</strong><small>By FC Barcelona</small></div><div class="stat-tile floating-card red"><span>Goals conceded</span><strong>${stats.goalsAgainst}</strong><small>Against FC Barcelona</small></div></div><section class="goals-panel floating-card"><div class="section-header"><h2>Goal balance</h2><span>${stats.goalsFor-stats.goalsAgainst>0?'+':''}${stats.goalsFor-stats.goalsAgainst}</span></div><div class="goal-bar" role="img" aria-label="${stats.goalsFor} goals scored; ${stats.goalsAgainst} conceded"><i style="width:${goals?stats.goalsFor/goals*100:50}%"></i></div><p>${stats.home} home <span>·</span> ${stats.away} away</p></section><div class="section-header"><h2>Recent results</h2><a class="text-button" href="#fixtures" data-open-results>All results ${icon('arrow')}</a></div>${games.slice(0,3).map(f=>row(f)).join('')||'<div class="empty-list"><p>No confirmed result is available yet.</p></div>'}<p class="sheet-note">${data.demo?'Sample results for this preview. ':''}La Liga and Champions League only. These are loaded results, not complete season totals.</p></section>`;
}

function pushSupported(){return 'Notification' in window&&'PushManager' in window&&'serviceWorker' in navigator;}
function notificationCard(){
 const supported=pushSupported(),ready=pushConfig?.ready&&!data?.demo&&supported&&!!pushRegistration;
 const labels=[[15,'15 minutes before'],[30,'30 minutes before'],[60,'1 hour before'],[120,'2 hours before'],[1440,'1 day before']];
 const message=pushMessage||(pushLoading?'Checking notification setup…':data?.demo?'Choose your reminder time for now. Push is available in the published app.':!supported?'Open this app from your iPhone Home Screen to enable notifications. Tap below for setup instructions.':!ready?'Notification setup is not ready. Tap below to retry.':pushEnabled?'Reminders are on for this device.':'Get a notification before each confirmed tracked match. You choose when.');
 const label=pushBusy?'Saving…':pushLoading?'Preparing reminders…':pushEnabled?'Turn off reminders':!supported?'How to enable notifications':ready?'Enable match reminders':'Retry reminder setup';
 return `<div class="setting-card floating-card reminder-card"><div class="reminder-heading"><span class="source-icon red">${icon('bell')}</span><span><h2>Match reminders</h2><small>${pushEnabled?'On for this device':'Off by default'}</small></span><i class="reminder-indicator ${pushEnabled?'on':''}"></i></div><p class="reminder-message" role="status">${e(message)}</p><label for="reminder-time">Remind me</label><select id="reminder-time" ${pushBusy?'disabled':''}>${labels.map(([value,label])=>`<option value="${value}" ${reminderMinutes===value?'selected':''}>${label}</option>`).join('')}</select><button class="${pushEnabled?'secondary':'primary'}" data-action="${pushEnabled?'disable-push':'enable-push'}" ${pushBusy||pushLoading?'disabled':''}>${icon('bell')}${label}</button><p class="reminder-footnote">iPhone: iOS 16.4 or later · Home Screen app. Confirmed La Liga and Champions League fixtures only. Reminders run about every five minutes; delivery may be delayed.</p></div>`;
}
function showNotificationHelp(blocked=false){
 sheet('Enable match reminders',`<p class="sheet-copy">${blocked?'Notifications are blocked for this app. Allow them in your device notification settings, then return here.':'iPhone notifications work from the installed Home Screen app.'}</p><ol class="instructions"><li>Open this site in Safari.</li><li>Tap Share → Add to Home Screen.</li><li>Open Barça Matchday using its Home Screen icon.</li><li>Go to Settings → Enable match reminders, then allow notifications.</li></ol><p class="sheet-note">Requires iOS 16.4 or later. In-app browsers may not support notifications. You can still subscribe to the fixture calendar.</p><button class="primary" data-action="close">Got it</button>`);
}
function pushToken(){let token=localStorage.getItem('cartel-push-token');if(!token){token=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');localStorage.setItem('cartel-push-token',token);}return token;}
async function pushSave(subscription,method='POST',lead=reminderMinutes){const response=await fetch('/api/push/subscription',{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+pushToken()},body:JSON.stringify(method==='DELETE'?{endpoint:subscription.endpoint}:{subscription:subscription.toJSON(),leadMinutes:lead}),signal:AbortSignal.timeout(12000)});if(!response.ok){let payload={};try{payload=await response.json();}catch{}const error=new Error(payload.error||'Push settings could not be saved. Check your connection and try again.');error.status=response.status;throw error;}}
async function loadPush(){
 if(pushLoading||pushBusy)return;
 pushLoading=true;if(page==='settings')render();
 try{
  const response=await fetch('/api/push/config',{cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('Notification setup could not be loaded. Check your connection and retry.');
  pushConfig=await response.json();
  if(pushSupported()){
   pushRegistration=await bounded(navigator.serviceWorker.ready,8000,'The app is still preparing notifications. Reload it and retry.');
   pushSubscription=await bounded(pushRegistration.pushManager.getSubscription(),5000);
   try{pushEnabled=!!pushSubscription&&localStorage.getItem('cartel-push-enabled')==='true';}catch{pushEnabled=false;}
  }
 }catch(error){pushMessage=error.message;}
 finally{pushLoading=false;if(page==='settings')render();}
}
async function enablePush(){
 if(pushBusy)return;
 if(!pushSupported()){showNotificationHelp();return;}
 if(Notification.permission==='denied'){pushMessage=notificationError({},'denied');render();showNotificationHelp(true);return;}
 if(data?.demo){pushMessage='Open the published app to enable real match reminders.';render();return;}
 if(!pushConfig?.ready||!pushRegistration){pushMessage='Retrying notification setup…';render();await loadPush();if(pushConfig?.ready&&pushRegistration){pushMessage='Ready. Tap Enable match reminders to allow notifications.';render();}return;}
 pushBusy=true;pushMessage='Waiting for notification permission…';render();let subscription,created=!pushSubscription;
 try{
  // Start immediately from this tap. No registration/network await precedes it.
  const subscribing=startPushSubscription(pushRegistration,pushConfig.publicKey,pushSubscription);
  subscription=await bounded(subscribing,25000,'Notification setup did not finish. Open the Home Screen app and try again.');
  pushMessage='Saving your reminder preference…';render();
  await pushSave(subscription);
  try{localStorage.setItem('cartel-push-enabled','true');}catch{}
  pushSubscription=subscription;pushEnabled=true;pushMessage='Match reminders are enabled on this device.';toast('Match reminders enabled');
 }catch(error){
  if(created&&subscription)await bounded(subscription.unsubscribe().catch(()=>{}),3000).catch(()=>{});
  if(!created&&error.status===403&&/another device session/.test(error.message)){
   await bounded(pushSubscription.unsubscribe().catch(()=>{}),3000).catch(()=>{});pushSubscription=null;pushEnabled=false;
   try{localStorage.removeItem('cartel-push-enabled');}catch{}
   pushMessage='Your old device connection was reset. Tap Enable match reminders again to reconnect.';
  }else pushMessage=notificationError(error,Notification.permission);
  toast(pushMessage);
 }finally{pushBusy=false;render();}
}
async function disablePush(){
 if(pushBusy)return;pushBusy=true;render();
 try{const registration=pushRegistration||await bounded(navigator.serviceWorker.ready),subscription=pushSubscription||await bounded(registration.pushManager.getSubscription());if(subscription){try{await pushSave(subscription,'DELETE');}catch{}if(!await subscription.unsubscribe())throw new Error();}localStorage.removeItem('cartel-push-enabled');pushEnabled=false;pushSubscription=null;pushMessage='Match reminders are off for this device.';toast('Match reminders turned off');}
 catch{toast('Reminders could not be turned off. Try again or use your device notification settings.');}finally{pushBusy=false;render();}
}
async function setReminderTime(value){
 const next=Number(value);if(![15,30,60,120,1440].includes(next))return;
 pushBusy=true;render();try{if(pushEnabled){const registration=pushRegistration||await bounded(navigator.serviceWorker.ready),subscription=pushSubscription||await bounded(registration.pushManager.getSubscription());if(!subscription)throw new Error();await pushSave(subscription,'POST',next);}localStorage.setItem('cartel-reminder',String(next));reminderMinutes=next;toast(pushEnabled?'Reminder time updated':'Preferred reminder time saved');}catch{toast('Reminder time could not be saved.');}finally{pushBusy=false;render();}
}

function photoSettings(){
 const prefs=photoLibrary.preferences,photos=activeHomePhotos(),enabled=photoLibrary.items.filter(photo=>!prefs.excluded.includes(photo.id));
 return `<section class="setting-card floating-card photo-settings"><div class="reminder-heading"><span class="source-icon">${icon('home')}</span><span><h2>Home poster photos</h2><small>${photos.length} in your rotation</small></span></div><p>Add your own picture, choose the collection, or keep one favourite. Photos stay on this device.</p>${!photoLibrary.available?'<p class="inline-notice">Photo storage is unavailable in this browser. Your supplied collection is still available.</p>':''}<input id="home-photo-file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden><button class="secondary" data-action="add-home-photo" ${!photoLibrary.available||photoSaving?'disabled':''}>${photoSaving?'Saving photo…':'Add a picture'}</button><div class="photo-options"><label for="photo-limit">Pictures to show<select id="photo-limit" ${!photoLibrary.available?'disabled':''}>${[[0,'All selected'],...Array.from({length:25},(_,i)=>[i+1,`${i+1} ${i===0?'picture':'pictures'}`])].map(([value,label])=>`<option value="${value}" ${prefs.limit===value?'selected':''}>${label}</option>`).join('')}</select></label><label class="photo-rotation-toggle"><input id="photo-rotate" type="checkbox" ${prefs.rotate?'checked':''} ${!photoLibrary.available?'disabled':''}>Rotate automatically<small>Every 30 seconds</small></label></div><p class="photo-library-count">${enabled.length} selected · ${photos.length} shown${!photos.length?' · Using the stadium illustration':''}</p><div class="photo-library">${photoLibrary.items.map(photo=>`<div class="photo-item ${prefs.excluded.includes(photo.id)?'photo-excluded':''}"><img src="${e(photo.url)}" alt="${e(photo.name)}" loading="lazy"><label><input type="checkbox" data-photo-include="${e(photo.id)}" aria-label="Include ${e(photo.name)}" ${prefs.excluded.includes(photo.id)?'':'checked'} ${!photoLibrary.available?'disabled':''}><span>${e(photo.name)}</span></label><button data-photo-use="${e(photo.id)}" aria-label="Use ${e(photo.name)} first" ${!photoLibrary.available?'disabled':''}>${prefs.selected===photo.id?'Favourite':'Use first'}</button>${!photo.builtin?`<button class="remove-photo" data-photo-remove="${e(photo.id)}" aria-label="Remove ${e(photo.name)}">Remove</button>`:''}</div>`).join('')}</div><button class="text-button" data-action="restore-home-photos" ${!photoLibrary.available?'disabled':''}>Restore the supplied collection</button><p class="photo-storage-note">Uncheck a picture to remove it from the rotation. Use first chooses your favourite; set the limit to 1 to keep it. Added photos are saved locally and do not sync between devices. Clearing site data removes them.</p></section>`;
}
async function updatePhotoSettings(operation,focusSelector){
 if(photoSaving)return;photoSaving=true;
 try{await operation();homePhotoGeneration++;homePhotoIndex=0;photoSaving=false;render();if(focusSelector)$(focusSelector)?.focus({preventScroll:true});}
 catch(error){toast(error.name==='QuotaExceededError'?'Your device has no room for another photo. Remove one and try again.':error.message||'The photo preference could not be saved.');}
 finally{photoSaving=false;}
}
function renderSettings(){return `<section class="content">${pageHeading('YOUR MATCHDAY','Settings')}${photoSettings()}${notificationCard()}<div class="setting-card floating-card"><h2>iPhone Calendar</h2><p>Subscribe for fixture changes, or add a single match from its details.</p><button class="primary" data-action="calendar">${icon('calendar')} Calendar subscription</button></div><div class="setting-card floating-card"><h2>Time display</h2><label for="time-format">Time format</label><select id="time-format"><option value="24" ${timeFormat==='24'?'selected':''}>24-hour (20:30)</option><option value="12" ${timeFormat==='12'?'selected':''}>12-hour (8:30 PM)</option></select><label for="timezone">Display times in</label><select id="timezone"><option value="local" ${timezone==='local'?'selected':''}>Automatic — phone (${e(deviceTimezone())})</option>${TIME_ZONES.map(([zone,label])=>`<option value="${zone}" ${timezone===zone?'selected':''}>${e(label)}</option>`).join('')}</select><p>Automatic follows your phone’s timezone. Manual choices include local daylight saving changes.</p><p class="sheet-note">Apple Calendar follows your phone’s calendar settings.</p></div><div class="setting-card floating-card"><h2>Data & coverage</h2><p>La Liga and Champions League. Scores and schedules may be delayed. Copa del Rey is outside the free provider’s coverage.</p><a class="inline-link" href="https://www.fcbarcelona.com/en/football/first-team/schedule" target="_blank" rel="noopener">Official Barça calendar, including Copa del Rey ${icon('external')}</a><p>${data?.demo?'Illustrative sample fixtures.':data?.checkedAt?'Last checked '+e(date(data.checkedAt,{dateStyle:'medium',timeStyle:'short'})):'Live data is not connected yet.'}</p><button class="secondary" data-action="refresh" ${refreshing?'disabled':''}>${icon('refresh')} ${refreshing?'Refreshing…':'Refresh saved fixtures'}</button><p class="refresh-status" role="status">${e(refreshStatus)}</p><p class="sheet-note">Barça Matchday · 2.5.1</p></div><div class="setting-card floating-card"><h2>Make it a Home Screen app</h2><p>Open in Safari → Share → Add to Home Screen. Your saved fixtures stay available offline.</p></div><div class="setting-card floating-card"><h2>Credits</h2><p>Home posters rotate through the supplied Camp Nou photo collection. Away stadium photographs come from Wikimedia Commons; use Photo credit for the photographer, licence and original file. The current match venue is shown separately when supplied.</p><p>An independent Barça companion. Club crests come from the fixture provider. Competition marks come from Wikimedia Commons or the provider.</p><p>${Object.entries(COMPETITION_BADGES).map(([code,badge])=>`<a class="inline-link" href="${e(badge.source)}" target="_blank" rel="noopener">${code}: ${e(badge.author)} · ${e(badge.license)}</a>`).join('<br>')}</p><p>Player photos come from Wikimedia Commons. Open a player profile for the photographer, licence and original file.</p><p><a class="inline-link" href="https://www.football-data.org" target="_blank" rel="noopener">Football data provided by the Football-Data.org API</a></p><p>Atmosphere photo: Camp Nou (2011), <a class="inline-link" href="https://commons.wikimedia.org/wiki/File:Campnoupano2011.jpg" target="_blank" rel="noopener">Jackpollock / Wikimedia Commons</a>, public domain. Historical artwork; match venue is shown separately.</p></div></section>`;}
function emptyView(){return `<section class="content">${pageHeading('MATCHDAY, MADE SIMPLE','Your next 90 minutes.')}<div class="setting-card floating-card"><h2>Waiting for the next fixture</h2><p>Once fixture data is connected, the next tracked match will appear here.</p><button class="secondary" data-action="refresh">${icon('refresh')} Refresh fixtures</button></div>${calendarBanner()}</section>`;}
function render(){
  $('.bottom-nav').innerHTML=[['match','home','Home'],['fixtures','list','Fixtures'],['calendar','calendar','Calendar'],['settings','settings','Settings']].map(([key,ico,label])=>`<a href="#${key}" ${(key==='match'?primaryPages.includes(page):page===key)?'aria-current="page"':''}>${icon(ico)}<span>${label}</span></a>`).join('');
  $('#section-tabs').hidden=!primaryPages.includes(page);
  $('#section-tabs').innerHTML=primaryPages.map(key=>`<a href="#${key}" ${page===key?'aria-current="page"':''}>${{match:'Home',news:'News',squad:'Squad',stats:'Stats'}[key]}</a>`).join('');
  $('#notice').hidden=!(data?.demo||offline||data?.stale||data?.refreshFailed);$('#notice').dataset.demo=!!data?.demo;
  $('#notice').textContent=data?.demo?`Design preview · sample fixtures${offline?' · offline':''}`:offline?'Offline · saved fixtures':data?.stale?'Schedule may be out of date':data?.refreshFailed?'Latest check failed · saved fixtures':'';
  const views={news:renderNews,squad:renderSquad,calendar:renderCalendar,settings:renderSettings};
  $('#main').innerHTML=views[page]?views[page]():!data?emptyView():page==='match'?renderMatch():page==='stats'?renderStats():renderFixtures();
  $('#source-footer').innerHTML=data?.demo?'Illustrative fixtures · calendar exports disabled in preview.':`${data?.checkedAt?'Updated '+e(date(data.checkedAt,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+' · '+e(tz())+'<br>':''}<a href="https://www.football-data.org" target="_blank" rel="noopener">Football data provided by the Football-Data.org API</a>`;
}
function maybeSharedMatch(){const id=new URLSearchParams(location.search).get('match');if(!id||sharedOpened||!data)return;sharedOpened=true;data.fixtures.some(f=>f.id===id)?details(id):toast('That match is no longer in the saved schedule.');}
function refresh(){
 if(refreshTask)return refreshTask;
 refreshing=true;$('[aria-label="Refresh fixtures"]')?.classList.add('spinning');
 refreshTask=(async()=>{
  try{const response=await fetch('/api/fixtures',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const loaded=await response.json();if(loaded.schemaVersion!==1||!Array.isArray(loaded.fixtures))throw new Error();data=loaded;offline=!!loaded.offline;try{localStorage.setItem('cartel-snapshot',JSON.stringify(data));}catch{}render();maybeSharedMatch();return {loaded:true,offline};}
  catch{offline=!!data;render();maybeSharedMatch();return {loaded:false,offline};}
  finally{refreshing=false;refreshTask=null;$('[aria-label="Refresh fixtures"]')?.classList.remove('spinning');if(page==='settings')render();}
 })();
 return refreshTask;
}
async function manualRefresh(){
 refreshStatus='Checking the latest saved fixtures…';toast(refreshStatus);render();
 const result=await refresh();
 refreshStatus=result.loaded&&!result.offline?(data.demo?'Preview refreshed.':'Saved fixtures refreshed · '+date(Date.now(),{hour:'2-digit',minute:'2-digit',second:'2-digit'})):data?'Could not reach the server. Showing previously saved fixtures.':'Could not load fixtures. Check your connection and try again.';
 render();toast(refreshStatus);
 // These updates must not delay the fixture confirmation.
 loadStadiums();if(page==='stats')loadStandings();if(page==='squad')loadTeam();if(page==='settings')loadPush();
}
async function loadTeam(){
  if(teamRefreshing)return;teamRefreshing=true;if(page==='squad'&&!teamData)render();
  try{const response=await fetch('/api/team',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const loaded=await response.json();if(loaded.schemaVersion!==1||!Array.isArray(loaded.squad))throw new Error();teamData=loaded;teamFailed=!!loaded.offline||!!loaded.refreshFailed;try{localStorage.setItem('cartel-team',JSON.stringify(loaded));}catch{}}
  catch{teamFailed=true;}finally{teamRefreshing=false;if(page==='squad')render();}
}
function sheet(title,body){$('#sheet-body').innerHTML=`<div class="sheet-content"><div class="handle"></div><div class="sheet-header"><h2 id="sheet-title" tabindex="-1" autofocus>${e(title)}</h2><button class="icon-button" data-action="close" aria-label="Close dialog">${icon('close')}</button></div>${body}</div>`;if(!$('#sheet').open)$('#sheet').showModal();$('#sheet').scrollTop=0;}
function subscriptionUrl(scope='all'){if(!data?.calendarUrl)return null;try{const u=new URL(data.calendarUrl);if(u.protocol!=='https:')return null;if(scope!=='all')u.searchParams.set('competition',scope);return u;}catch{return null;}}
function showCalendar(scope='all'){
  const u=subscriptionUrl(scope), ready=!!data?.calendarReady&&!data?.demo&&!!u;
  const eligible=data?.fixtures.filter(f=>f.timeConfirmed&&!['POSTPONED','CANCELLED'].includes(f.status)&&Date.parse(f.kickoffUtc)>Date.now()&&(scope==='all'||f.competition===scope)).length||0;
  const omitted=data?.fixtures.filter(f=>!f.timeConfirmed&&f.status==='SCHEDULED'&&!f.calendarStart&&Date.parse(f.kickoffUtc)>Date.now()&&(scope==='all'||f.competition===scope)).length||0;
  sheet('Your iPhone calendar',`<p class="sheet-copy">Subscribe once. Fixture changes appear when Apple Calendar next refreshes the feed. Matches with pending kickoff times appear as all-day entries until their time is announced.</p><label class="sheet-kicker" for="calendar-scope">INCLUDE</label><select id="calendar-scope">${[['all','All tracked fixtures'],['PD','La Liga only'],['CL','Champions League only']].map(([value,label])=>`<option value="${value}" ${value===scope?'selected':''}>${label}</option>`).join('')}</select><p class="sheet-note">${eligible} upcoming confirmed ${eligible===1?'match':'matches'} · ${omitted} date-only ${omitted===1?'match':'matches'} with kickoff pending.<br>La Liga + Champions League. Cup fixtures are not included.</p>${ready?`<a class="primary" href="${e(u.href.replace(/^https:/,'webcal:'))}">${icon('calendar')} Subscribe in Apple Calendar</a><label class="sheet-kicker" for="calendar-url">OR COPY THE SUBSCRIPTION LINK</label><input id="calendar-url" class="url-field" readonly value="${e(u.href)}"><button class="secondary" data-action="copy-url">Copy calendar link</button>`:`<div class="status-card"><strong>${data?.demo?'Preview only':'Subscription not ready'}</strong><p>The app needs live fixture data and a public HTTPS address before you can subscribe on iPhone.</p></div><button class="primary" disabled>${icon('calendar')} Subscribe in Apple Calendar</button>`}<details class="instructions" open><summary>How to subscribe on iPhone</summary><ol><li>Tap Subscribe above. If nothing opens, use Safari or copy the calendar link.</li><li>In Calendar, open Calendars → Add Calendar → Add Subscription Calendar.</li><li>Paste the HTTPS link, then follow Apple’s prompts.</li></ol></details><p class="sheet-note" style="margin-top:15px">This is a read-only fixture calendar. It does not read your personal calendars. Refresh timing and alerts are controlled by iOS.</p><p class="sheet-note">To remove it: Calendar → Calendars → the info button beside the subscription → Unsubscribe.</p><a class="inline-link" style="font-size:11px" href="https://support.apple.com/en-gb/guide/iphone/iph3d1110d4/ios" target="_blank" rel="noopener">Apple’s calendar instructions ↗</a>`);
}
let historyCache=new Map();
function stadiumCredit(id){const stadium=safeStadium(stadiumData[id]);if(!stadium)return;sheet('Stadium photograph',`<h3 class="detail-title">${e(stadium.name)}</h3><p class="sheet-copy">Photo: ${e(stadium.photo.author)}<br>${e(stadium.photo.license)}. Historical stadium imagery, cropped and tinted for the poster. The current match venue is shown separately when supplied.</p><a class="primary" href="${e(stadium.photo.source)}" target="_blank" rel="noopener">Original photo & licence ${icon('external')}</a>`);}

function historyPanel(f,payload,loading=false,failed=false){
  const games=recentMeetings(payload?.fixtures||data?.fixtures||[],f), counts={W:0,D:0,L:0};
  games.forEach(game=>counts[meetingOutcome(game)]++);
  const note=payload?.demo||data.demo?'Illustrative results · design preview':payload?.archiveUsed?'Includes verified historical meetings from UEFA and official club records':payload?.limited||!payload?'Saved tracked results only · earlier history unavailable':payload.stale||payload.refreshFailed||failed?'Saved meetings · may be out of date':'Recent available meetings · coverage may be incomplete';
  const sources=[...new Map((payload?.sources||[]).filter(source=>{try{const url=new URL(source.url);return url.protocol==='https:'&&['www.uefa.com','www.fcbarcelona.com','players.fcbarcelona.com'].includes(url.hostname);}catch{return false;}}).map(source=>[source.name,source])).values()];
  return `<div class="h2h-heading"><span><span class="eyebrow">HEAD TO HEAD</span><h3>Recent meetings</h3></span><span class="h2h-count">${games.length}${games.length===5?' / 5':''}</span></div><p class="h2h-caption">Barça vs ${e(opponent(f).name)}</p>${games.length?`<div class="h2h-summary" aria-label="Barcelona results in these ${games.length} meetings">${[['W','Wins'],['D','Draws'],['L','Losses']].map(([key,label])=>`<span class="result-${key}"><b>${counts[key]}</b>${counts[key]===1?label.slice(0,-1):label}</span>`).join('')}</div><ol class="h2h-list">${games.map(game=>{const outcome=meetingOutcome(game);return `<li><div class="h2h-meta"><time datetime="${e(game.kickoffUtc)}">${e(game.dateOnly?new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}).format(new Date(game.kickoffUtc)):date(game.kickoffUtc,{day:'numeric',month:'short',year:'numeric'}))}</time><span>${e(game.competitionName)}</span></div><div class="h2h-game"><span class="h2h-team ${game.homeTeam.id===81?'barca':''}">${shield(game.homeTeam,true)}<span>${e(game.homeTeam.shortName||game.homeTeam.name)}</span></span><strong class="h2h-score">${game.score.home}<span>–</span>${game.score.away}</strong><span class="h2h-team ${game.awayTeam.id===81?'barca':''}"><span>${e(game.awayTeam.shortName||game.awayTeam.name)}</span>${shield(game.awayTeam,true)}</span><span class="result-badge result-${outcome}" aria-label="Barcelona ${outcome==='W'?'win':outcome==='D'?'draw':'loss'}">${outcome}</span></div>${game.score.duration==='PENALTY_SHOOTOUT'?`<small class="h2h-extra">After penalties${game.score.penalties?.home!=null?' · '+game.score.penalties.home+'–'+game.score.penalties.away:''}</small>`:game.score.duration==='EXTRA_TIME'?'<small class="h2h-extra">After extra time</small>':''}</li>`;}).join('')}</ol>`:`<p class="h2h-empty">${loading?'Loading recent meetings…':'No previous meeting is available in the saved data.'}</p>`}<p class="h2h-note">${e(note)}${loading&&games.length?' · checking history…':''}</p>${sources.map(source=>`<a class="inline-link h2h-source" href="${e(source.url)}" target="_blank" rel="noopener">${e(source.name)} match archive ↗</a>`).join(' · ')}`;
}
async function loadHistory(f){
  let payload=historyCache.get(f.id),failed=false;
  try{const response=await fetch('/api/head-to-head?match='+encodeURIComponent(f.id),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const loaded=await response.json();if(loaded.schemaVersion!==1||loaded.matchId!==f.id||!Array.isArray(loaded.fixtures))throw new Error();payload=loaded;historyCache.set(f.id,payload);try{localStorage.setItem('cartel-history-'+f.id,JSON.stringify(payload));}catch{}}
  catch{failed=true;}
  const section=$('#head-to-head');if(section?.dataset.matchId===f.id&&$('#sheet').open)section.innerHTML=historyPanel(f,payload,false,failed);
}
function showPoster(id){const f=data?.fixtures.find(f=>f.id===id);if(!f)return;sheet(place(f)+' match poster',`<div class="poster-preview">${hero(f,true)}</div><p class="sheet-note">${data.demo?'Illustrative fixture · design preview. ':''}Historical stadium imagery; the actual venue is listed when confirmed.</p>`);}
function details(id){const f=data?.fixtures.find(f=>f.id===id);if(!f)return;
  const canAdd=(f.timeConfirmed||f.status==='SCHEDULED')&&!['CANCELLED','POSTPONED'].includes(f.status)&&!data.demo;
  if(!historyCache.has(id))try{const cached=JSON.parse(localStorage.getItem('cartel-history-'+id));if(cached?.matchId===id&&cached.schemaVersion===1)historyCache.set(id,{...cached,stale:true});}catch{}
  sheet('Match details',`<p class="sheet-kicker">${e(f.competitionName)} / ${e(f.round)}</p><div class="duel">${shield(f.homeTeam)}<span class="versus">VS</span>${shield(f.awayTeam)}</div><h3 class="detail-title match-detail-title"><span>${e(f.homeTeam.name)}</span><small>vs</small><span>${e(f.awayTeam.name)}</span></h3><button class="poster-link" data-poster="${e(f.id)}">View ${e(place(f).toLowerCase())} poster ${icon('arrow')}</button><p class="detail-kickoff">${e(fixtureWhen(f))} · ${e(place(f))}</p><section class="h2h-card" id="head-to-head" data-match-id="${e(f.id)}" aria-label="Recent meetings between the teams">${historyPanel(f,historyCache.get(id),true)}</section><dl class="details-grid"><div><dt>KICKOFF</dt><dd>${e(fixtureWhen(f))}</dd></div><div><dt>TIMEZONE</dt><dd>${e(tz())}</dd></div><div><dt>VENUE</dt><dd>${e(venueLabel(f))}</dd></div><div><dt>STATUS</dt><dd>${e(stateLabel(f))}</dd></div></dl>${venueNote(f)}${['FINISHED','AWARDED'].includes(f.status)&&f.score.home!==null&&f.score.away!==null?`<p class="result-score">${f.score.home} – ${f.score.away}</p><p class="sheet-note">${f.score.duration==='PENALTY_SHOOTOUT'?'After penalties':f.score.duration==='EXTRA_TIME'?'After extra time':'Confirmed result'}${f.score.penalties?.home!=null?' · penalties '+f.score.penalties.home+'–'+f.score.penalties.away:''}</p>`:''}${canAdd?`<a class="primary" href="/calendar/match/${encodeURIComponent(f.id)}.ics">${icon('calendar')} Add this match</a>`:'<button class="primary" disabled>Add this match</button>'}<p class="sheet-note">A single-match import does not stay in sync. ${data.demo?'Calendar exports are disabled for sample fixtures.':!f.timeConfirmed?'Pending kickoff: exported as an all-day event.':''}</p><button class="secondary" data-action="calendar">Subscribe to tracked fixtures</button><p class="sheet-note">Calendar end times are estimated two-hour placeholders. They do not confirm when the match finishes.</p>`);
  loadHistory(f);
}

async function shareMatch(id){
  const f=data?.fixtures.find(f=>f.id===id);if(!f)return;
  const text=`${f.homeTeam.name} vs ${f.awayTeam.name}\n${f.competitionName} · ${fixtureWhen(f,{dateStyle:'full',timeStyle:'short'})}${f.timeConfirmed?' ('+tz()+')':''}${data.demo?'\nIllustrative preview fixture.':''}`;
  const url=new URL('/',location.origin);url.searchParams.set('match',f.id);url.hash='match';
  const share={title:'Barça · Matchday',text,...(location.protocol==='https:'&&!data.demo?{url:url.href}:{})};
  try{if(navigator.share){await navigator.share(share);return;}}catch(error){if(error.name==='AbortError')return;}
  try{await navigator.clipboard.writeText(text+(share.url?'\n'+share.url:''));toast(data.demo?'Sample match copied':'Match copied');}catch{sheet('Share match',`<p class="sheet-copy">Select and copy these match details.</p><textarea class="share-text" readonly>${e(text+(share.url?'\n'+share.url:''))}</textarea>`);}
}
document.addEventListener('click',async event=>{
  const target=event.target.closest('button,a');if(!target)return;
  if(target.dataset.match)details(target.dataset.match);
  if(target.dataset.photoUse)await updatePhotoSettings(()=>savePhotoPreferences({selected:target.dataset.photoUse,excluded:photoLibrary.preferences.excluded.filter(id=>id!==target.dataset.photoUse)}));
  if(target.dataset.photoRemove)await updatePhotoSettings(()=>removeHomePhoto(target.dataset.photoRemove));
  if(target.dataset.stadium)stadiumCredit(target.dataset.stadium);
  if(target.dataset.poster)showPoster(target.dataset.poster);
  if(target.dataset.share)await shareMatch(target.dataset.share);
  if(target.dataset.player)playerDetails(target.dataset.player);
  if(target.dataset.standing)standingsDetails(target.dataset.standing);
  if(target.dataset.tableCompetition){tableCompetition=target.dataset.tableCompetition;render();loadStandings();}
  if(target.dataset.competition){competition=target.dataset.competition;render();}
  if(target.dataset.fixtureView){fixtureView=target.dataset.fixtureView;render();}
  if(target.hasAttribute('data-open-results'))fixtureView='results';
  if(target.dataset.position){squadFilter=target.dataset.position;render();}
  if(target.dataset.day){selectedDay=target.dataset.day===selectedDay?null:target.dataset.day;render();}
  if(target.dataset.month){const next=shiftMonth(calendarYear,calendarMonth,Number(target.dataset.month));calendarYear=next.year;calendarMonth=next.month;selectedDay=null;render();}
  const action=target.dataset.action;
  if(action==='next-photo')await rotateHomePhoto(true);
  if(action==='add-home-photo')$('#home-photo-file').click();
  if(action==='restore-home-photos')await updatePhotoSettings(()=>savePhotoPreferences({excluded:[],limit:0,rotate:true,selected:''}));
  if(action==='month-agenda'){selectedDay=null;render();$('#month-agenda')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  if(action==='close')$('#sheet').close();
  if(action==='calendar')showCalendar();
  if(action==='today'){initMonth();selectedDay=dateKey(Date.now(),tz());render();}
  if(action==='clear-day'){selectedDay=null;render();}
  if(action==='refresh')await manualRefresh();
  if(action==='refresh-team')await loadTeam();
  if(action==='enable-push')await enablePush();
  if(action==='disable-push')await disablePush();
  if(action==='refresh-standings')await loadStandings();
  if(action==='jump-barca')document.querySelector('.barca-table-row')?.scrollIntoView({block:'nearest',behavior:'smooth'});
  if(action==='search'){fixtureView='upcoming';location.hash='fixtures';if(page==='fixtures')render();requestAnimationFrame(()=>$('#fixture-search')?.focus());}
  if(action==='copy-url'){try{await navigator.clipboard.writeText($('#calendar-url').value);toast('Calendar link copied');}catch{$('#calendar-url').focus();$('#calendar-url').select();toast('Select and copy the calendar link');}}
});
document.addEventListener('input',event=>{if(event.target.id==='fixture-search'){query=event.target.value;$('#fixture-list').innerHTML=fixtureList();}});
document.addEventListener('change',async event=>{
  if(event.target.id==='home-photo-file'){const file=event.target.files?.[0];if(file)await updatePhotoSettings(()=>addHomePhoto(file));event.target.value='';}
  if(event.target.id==='photo-limit')await updatePhotoSettings(()=>savePhotoPreferences({limit:Number(event.target.value)}),'#photo-limit');
  if(event.target.id==='photo-rotate')await updatePhotoSettings(()=>savePhotoPreferences({rotate:event.target.checked}),'#photo-rotate');
  if(event.target.dataset.photoInclude){const id=event.target.dataset.photoInclude;await updatePhotoSettings(()=>savePhotoPreferences({excluded:event.target.checked?photoLibrary.preferences.excluded.filter(key=>key!==id):[...photoLibrary.preferences.excluded,id]}),`[data-photo-include="${id}"]`);}
  if(event.target.id==='reminder-time')setReminderTime(event.target.value);
  if(event.target.id==='time-format'){timeFormat=event.target.value==='12'?'12':'24';try{localStorage.setItem('cartel-time-format',timeFormat);}catch{}render();}
  if(event.target.id==='timezone'){timezone=timezonePreference(event.target.value);renderedTimezone=tz();try{localStorage.setItem('cartel-timezone',timezone);}catch{}selectedDay=null;render();}
  if(event.target.id==='calendar-scope'){showCalendar(event.target.value);$('#calendar-scope').focus({preventScroll:true});}
});
window.addEventListener('hashchange',()=>{page=pages.includes(location.hash.slice(1))?location.hash.slice(1):'match';render();window.scrollTo({top:0,behavior:'instant'});if(page==='squad')loadTeam();if(page==='stats')loadStandings();if(page==='settings')loadPush();});
window.addEventListener('online',()=>{refresh();if(page==='squad')loadTeam();if(page==='stats')loadStandings();if(page==='settings')loadPush();});window.addEventListener('offline',()=>{offline=true;render();});
async function loadStadiums(){if(stadiumRefreshing)return;stadiumRefreshing=true;try{const response=await fetch('/api/stadiums',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const loaded=await response.json();if(loaded.schemaVersion!==1||!loaded.stadiums)throw new Error();for(const [id,stadium] of Object.entries(loaded.stadiums))if(safeStadium(stadium))stadiumData[id]=stadium;for(const [id,venue] of Object.entries(loaded.venues||{}))if(safeVenue(venue))venueData[id]=venue;try{localStorage.setItem('cartel-stadiums',JSON.stringify(stadiumData));localStorage.setItem('cartel-venues',JSON.stringify(venueData));}catch{}if(page==='match')render();}catch{}finally{stadiumRefreshing=false;}}
try{const cachedVenues=JSON.parse(localStorage.getItem('cartel-venues'));for(const [id,venue]of Object.entries(cachedVenues||{}))if(safeVenue(venue))venueData[id]=venue;const cached=JSON.parse(localStorage.getItem('cartel-stadiums'));for(const [id,stadium] of Object.entries(cached||{}))if(safeStadium(stadium))stadiumData[id]=stadium;}catch{}
document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncDeviceTimezone();if(navigator.standalone||matchMedia('(display-mode: standalone)').matches){page='match';history.replaceState(null,'',location.pathname+location.search+'#match');render();window.scrollTo({top:0,behavior:'instant'});}refresh();loadStadiums();if(page==='squad')loadTeam();if(page==='stats')loadStandings();if(page==='settings')loadPush();}});
loadStadiums();
try{const cached=JSON.parse(localStorage.getItem('cartel-snapshot'));if(cached?.schemaVersion===1&&Array.isArray(cached.fixtures)){data=cached;offline=true;}const team=JSON.parse(localStorage.getItem('cartel-team'));if(team?.schemaVersion===1&&Array.isArray(team.squad))teamData=team;}catch{}
$('.header-actions [data-action="search"]').innerHTML=icon('search');
$('#pull-refresh').innerHTML=icon('refresh')+'<span>Pull to refresh</span>';
installPullRefresh({indicator:$('#pull-refresh'),refresh:manualRefresh,blocked:()=>$('#sheet').open||refreshing});
try{const tables=JSON.parse(localStorage.getItem('cartel-tables'));for(const code of ['PD','CL'])if(tables?.[code]?.schemaVersion===1&&Array.isArray(tables[code].tables)){tableData[code]=tables[code];tableFailed[code]=true;}}catch{}
render();refresh();if(page==='squad')loadTeam();if(page==='stats')loadStandings();if(page==='settings')loadPush();
async function rotateHomePhoto(manual=false){
 if(homePhotoBusy||document.hidden||activeHomePhotos().length<2||(!manual&&!photoLibrary.preferences.rotate))return;
 const cards=[...document.querySelectorAll('.poster-banner.home-game')].filter(card=>card.getBoundingClientRect().bottom>0&&card.getBoundingClientRect().top<innerHeight&&(!$('#sheet').open||card.closest('#sheet')));
 if(!cards.length)return;
 const photos=activeHomePhotos();homePhotoBusy=true;const generation=++homePhotoGeneration,next=(homePhotoIndex+1)%photos.length,photo=photos[next];
 const ready=new Image();ready.src=photo.url;
 try{await ready.decode();if(generation!==homePhotoGeneration)return;homePhotoIndex=next;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  for(const card of cards){if(!card.isConnected)continue;const scene=card.querySelector('.poster-scene'),old=scene.querySelector('.stadium-art');
   const image=document.createElement('img');image.className='stadium-art incoming-photo';image.alt='';image.src=photo.url;image.style.objectPosition=photo.position;
   if(manual||reduce){old?.remove();image.classList.remove('incoming-photo');scene.prepend(image);scene.style.setProperty('--stadium-image',`url('${photo.url}')`);}
   else{scene.prepend(image);requestAnimationFrame(()=>requestAnimationFrame(()=>image.classList.add('photo-visible')));setTimeout(()=>{if(!image.isConnected)return;old?.remove();image.classList.remove('incoming-photo','photo-visible');scene.style.setProperty('--stadium-image',`url('${photo.url}')`);},700);}
   const control=card.querySelector('.home-photo-control');if(control){control.querySelector('.photo-number').textContent=`${homePhotoIndex+1} / ${photos.length}`;control.querySelectorAll('.photo-dots i').forEach((dot,index)=>dot.classList.toggle('active',index===homePhotoIndex));}
  }
  if(!manual&&!reduce)await new Promise(resolve=>setTimeout(resolve,700));
 }catch{if(manual)toast('This photo is not available yet.');}finally{homePhotoBusy=false;}
}
setInterval(()=>{if(!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches)rotateHomePhoto();},30000);
setInterval(()=>{if(document.hidden||!data)return;if(page==='match'){const f=currentMatch(data.fixtures)||upcoming(data.fixtures)[0]||finishedFixtures(data.fixtures)[0];if($('#main .match-card')?.dataset.matchId!==f?.id)render();}document.querySelectorAll('[data-countdown]').forEach(panel=>{const f=data.fixtures.find(f=>f.id===panel.dataset.countdown);if(f)panel.innerHTML=timer(f);});},1000);
// Re-read the phone timezone after travel or a device setting change.
setInterval(syncDeviceTimezone,60000);
// Read the shared cache while play is active or kickoff has just passed.
setInterval(()=>{if(document.hidden||!data||refreshing)return;const now=Date.now();if(data.fixtures.some(f=>livePresentation(f).active||f.status==='TIMED'&&f.timeConfirmed&&now-Date.parse(f.kickoffUtc)>=-60000&&now-Date.parse(f.kickoffUtc)<3*3600000))refresh();},60000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
