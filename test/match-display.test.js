import test from 'node:test';
import assert from 'node:assert/strict';
import {countdownClock,livePresentation,clockFormat} from '../public/match-display.js';
import {refreshInterval} from '../worker/refresh.js';
import {officialVenue} from '../worker/match-venues.js';
const f={status:'TIMED',timeConfirmed:true,kickoffUtc:'2026-10-10T16:30:00Z',score:{home:null,away:null}};
test('countdown includes seconds, crosses unit boundaries and stops at kickoff',()=>{
 const start=Date.parse(f.kickoffUtc);
 assert.deepEqual(countdownClock(f,start-86400000-3600000-60000-1000),{days:1,hours:1,minutes:1,seconds:1});
 assert.deepEqual(countdownClock(f,start-1000),{days:0,hours:0,minutes:0,seconds:1});
 assert.equal(countdownClock(f,start),null);
 assert.equal(countdownClock({...f,timeConfirmed:false},start-1000),null);
});
test('LIVE requires provider confirmation and never invents an unknown score',()=>{
 assert.equal(livePresentation(f).active,false);
 assert.deepEqual(livePresentation({...f,status:'IN_PLAY'}),{active:true,label:'LIVE',score:'–',hasScore:false});
 assert.equal(livePresentation({...f,status:'PAUSED',score:{home:2,away:1}}).label,'Half-time');
 assert.equal(livePresentation({...f,status:'IN_PLAY',score:{home:0,away:0}}).score,'0–0');
 assert.equal(livePresentation({...f,status:'FINISHED'}).active,false);
 assert.equal(livePresentation({...f,status:'SUSPENDED'}).active,false);
});
test('12/24 hour formatting preserves the timezone and kickoff instant',()=>{
 const opts={timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit'};
 assert.equal(new Intl.DateTimeFormat('en-GB',clockFormat(opts,'24')).format(new Date(f.kickoffUtc)),'18:30');
 assert.match(new Intl.DateTimeFormat('en-GB',clockFormat(opts,'12')).format(new Date(f.kickoffUtc)),/06:30 pm/i);
 assert.equal(clockFormat({month:'long'},'12').hourCycle,undefined);
 assert.equal(clockFormat({timeStyle:'short'},'12').hourCycle,'h12');
});
test('legacy freshness thresholds distinguish live and finished provider data',()=>{
 const start=Date.parse(f.kickoffUtc);
 assert.equal(refreshInterval({fixtures:[f]},start-3600000),3600000);
 assert.equal(refreshInterval({fixtures:[f]},start+60000),300000);
 assert.equal(refreshInterval({fixtures:[{...f,status:'IN_PLAY'}]},start+7200000),300000);
 assert.equal(refreshInterval({fixtures:[{...f,status:'FINISHED'}]},start+7200000),21600000);
});
test('official venue corrections require the exact match, date and teams',()=>{
 const match={...f,id:'fd-564713',kickoffUtc:'2026-10-17T16:30:00Z',homeTeam:{id:90},awayTeam:{id:81},venue:null};
 assert.equal(officialVenue(match).venue,'Estadio La Cartuja de Sevilla');
 assert.equal(officialVenue({...match,kickoffUtc:'2026-10-18T16:30:00Z'}).venue,null);
 assert.equal(officialVenue({...match,homeTeam:{id:82}}).venue,null);
 assert.equal(officialVenue({...match,venue:'Confirmed replacement stadium'}).venue,'Confirmed replacement stadium');
});
