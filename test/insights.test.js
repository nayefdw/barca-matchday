import test from 'node:test';
import assert from 'node:assert/strict';
import { matchResult, recentForm, monthCalendar, dateKey, shiftMonth, countdownParts, searchFixtures } from '../public/insights.js';
const club={id:81,name:'FC Barcelona',tla:'FCB'}, rival={id:90,name:'Real Betis Balompié',tla:'BET'};
const fixture=(overrides={})=>({id:'one',homeTeam:club,awayTeam:rival,competition:'PD',competitionName:'La Liga',kickoffUtc:'2026-10-10T18:30:00Z',status:'TIMED',timeConfirmed:true,score:{home:null,away:null},...overrides});
test('form uses Barcelona’s result at home and away, and excludes incomplete scores',()=>{
 const home=fixture({id:'home',status:'FINISHED',score:{home:3,away:1}});
 const away=fixture({id:'away',homeTeam:rival,awayTeam:club,status:'FINISHED',score:{home:2,away:0},kickoffUtc:'2026-10-11T18:30:00Z'});
 assert.equal(matchResult(home).outcome,'W');assert.equal(matchResult(away).outcome,'L');
 assert.equal(matchResult(fixture({status:'FINISHED'})),null);
 assert.deepEqual(recentForm([away,fixture(),home]).map(f=>f.outcome),['W','L']);
});
test('the calendar puts fixtures on the device timezone’s day, omitting unconfirmed and cancelled matches',()=>{
 const late=fixture({kickoffUtc:'2026-10-10T23:30:00Z'});
 const tbc=fixture({id:'tbc',status:'SCHEDULED',timeConfirmed:false});
 const cancelled=fixture({id:'cancelled',status:'CANCELLED',timeConfirmed:false});
 const cl=fixture({id:'cl',competition:'CL'});
 const madrid=monthCalendar([late,tbc,cancelled,cl],{year:2026,month:10,timeZone:'Europe/Madrid',competition:'PD'});
 assert.equal(madrid.days[10].fixtures[0].id,'one');assert.equal(madrid.days[9].fixtures.length,0);
 const newYork=monthCalendar([late],{year:2026,month:10,timeZone:'America/New_York'});
 assert.equal(newYork.days[9].fixtures.length,1);
 assert.equal(madrid.offset,3);
});
test('leap years, December navigation and DST fallback are handled consistently',()=>{
 assert.equal(monthCalendar([],{year:2028,month:2,timeZone:'UTC'}).days.length,29);
 assert.deepEqual(shiftMonth(2026,12,1),{year:2027,month:1});
 assert.deepEqual(shiftMonth(2027,1,-1),{year:2026,month:12});
 assert.equal(dateKey('2026-10-25T00:30:00Z','Europe/Madrid'),'2026-10-25');
 assert.equal(dateKey('2026-10-25T01:30:00Z','Europe/Madrid'),'2026-10-25');
});
test('search recognizes complete names, abbreviations and accents',()=>{
 const list=[fixture()];assert.equal(searchFixtures(list,'betis balompie').length,1);
 assert.equal(searchFixtures(list,'BET').length,1);assert.equal(searchFixtures(list,'Champions').length,0);
});
test('countdown stops at kickoff and does not invent live states',()=>{
 const f=fixture(), start=Date.parse(f.kickoffUtc);
 assert.deepEqual(countdownParts(f,start-3*86400000-2*3600000-5*60000),{days:3,hours:2,minutes:5});
 assert.deepEqual(countdownParts(f,start-15000),{days:0,hours:0,minutes:0});
 assert.equal(countdownParts(f,start),null);assert.equal(countdownParts({...f,status:'IN_PLAY'},start-60000),null);
});
