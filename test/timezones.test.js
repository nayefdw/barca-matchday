import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {TIME_ZONES,timezonePreference,resolveTimezone,timezoneLabel} from '../public/timezones.js';
import {fixtureDateKey} from '../public/insights.js';
const clock=(value,zone)=>new Intl.DateTimeFormat('en-GB',{timeZone:resolveTimezone(zone),hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
test('automatic mode detects the runtime timezone, including places outside the manual list',()=>{
 for(const zone of ['America/Chicago','Asia/Gaza','Asia/Kolkata']){
  const code="import {deviceTimezone,resolveTimezone} from './public/timezones.js'; console.log(JSON.stringify({device:deviceTimezone(),chosen:resolveTimezone('local')}));";
  const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:new URL('..',import.meta.url),env:{...process.env,TZ:zone},encoding:'utf8'}));
  // Older ICU databases retain Calcutta as Kolkata's canonical alias.
  if(zone==='Asia/Kolkata')assert.ok(['Asia/Kolkata','Asia/Calcutta'].includes(result.device));
  else assert.equal(result.device,zone);
  assert.equal(result.chosen,result.device);
 }
});
test('manual choices persist independently of the detected phone zone and legacy preferences migrate',()=>{
 assert.equal(resolveTimezone('America/Chicago','Asia/Gaza'),'America/Chicago');
 assert.equal(resolveTimezone('local','Asia/Hebron'),'Asia/Hebron');
 assert.equal(timezonePreference('barcelona'),'Europe/Madrid');
 assert.equal(timezonePreference('invalid/saved-zone'),'local');
 assert.equal(resolveTimezone('local','invalid/phone-zone'),'UTC');
 assert.equal(timezoneLabel('Asia/Gaza'),'Palestine — Gaza time');
 for(const [zone] of TIME_ZONES)assert.equal(timezonePreference(zone),zone);
});
test('Chicago and both Palestinian zones use seasonal offsets rather than a fixed hour difference',()=>{
 assert.equal(clock('2026-01-10T18:30:00Z','America/Chicago'),'12:30');
 assert.equal(clock('2026-07-10T18:30:00Z','America/Chicago'),'13:30');
 for(const zone of ['Asia/Gaza','Asia/Hebron']){
  assert.equal(clock('2026-01-10T18:30:00Z',zone),'20:30');
  assert.equal(clock('2026-07-10T18:30:00Z',zone),'21:30');
 }
 assert.equal(clock('2026-03-08T07:59:00Z','America/Chicago'),'01:59');
 assert.equal(clock('2026-03-08T08:00:00Z','America/Chicago'),'03:00');
});
test('calendar days adjust for confirmed kickoff instants but pending-time dates remain their published day',()=>{
 const f={timeConfirmed:true,kickoffUtc:'2026-10-11T00:30:00Z'};
 assert.equal(fixtureDateKey(f,resolveTimezone('America/Chicago')),'2026-10-10');
 assert.equal(fixtureDateKey(f,resolveTimezone('Asia/Gaza')),'2026-10-11');
 assert.equal(fixtureDateKey({...f,timeConfirmed:false},resolveTimezone('America/Chicago')),'2026-10-11');
});
