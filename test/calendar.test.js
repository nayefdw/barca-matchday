import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMatches } from '../worker/normalize.js';
import { createCalendar, foldLine, escapeText, calendarResponse } from '../worker/calendar.js';
const at = '2026-10-07T12:00:00.000Z';
function provider(overrides = {}) { return { id: 101, utcDate:'2026-10-10T18:30:00Z', status:'TIMED', competition:{code:'PD'}, homeTeam:{id:81,name:'Barcelona',tla:'FCB'}, awayTeam:{id:82,name:'Getafe',tla:'GET'}, matchday:9, score:{fullTime:{home:null,away:null}}, ...overrides }; }
function snapshot(matches, previous = null, checkedAt = at) { return { schemaVersion:1, checkedAt, fixtures:normalizeMatches({matches}, previous, checkedAt), demo:false }; }
const unfold = s => s.replace(/\r\n /g, '');
test('UTC events survive rescheduling with the same UID and an increased sequence', () => {
  const first = snapshot([provider()]);
  const second = snapshot([provider({utcDate:'2026-10-11T20:00:00Z'})], first, '2026-10-08T12:00:00Z');
  const body = unfold(createCalendar(second));
  assert.match(body, /UID:fd-101@cartel-barca.fixtures\r\n/);
  assert.match(body, /SEQUENCE:2\r\n/);
  assert.match(body, /DTSTART:20261011T200000Z\r\nDTEND:20261011T220000Z/);
  const unchanged = snapshot([provider({utcDate:'2026-10-11T20:00:00Z'})], second, '2026-10-09T12:00:00Z');
  assert.equal(createCalendar(unchanged), createCalendar(second));
});
test('postponement, cancellation and loss of confirmation retract the original event', () => {
  const first = snapshot([provider()]);
  for (const status of ['POSTPONED', 'CANCELLED', 'SCHEDULED']) {
    const next = snapshot([provider({status,utcDate:'2026-10-17T00:00:00Z'})], first);
    const body = createCalendar(next);
    assert.match(body, /DTSTART:20261010T183000Z/);
    assert.match(body, /STATUS:CANCELLED/);
    assert.match(body, /SEQUENCE:2/);
    const confirmed = snapshot([provider({utcDate:'2026-10-18T19:00:00Z'})], next);
    assert.match(createCalendar(confirmed), /SEQUENCE:3/);
    assert.match(createCalendar(confirmed), /STATUS:CONFIRMED/);
  }
});
test('published dates export as tentative all-day entries; competition filters and single events work', () => {
  const value = snapshot([provider(), provider({id:102,status:'SCHEDULED'}), provider({id:103,competition:{code:'CL'}})]);
  assert.equal((createCalendar(value).match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.match(createCalendar(value,{matchId:'fd-102'}), /DTSTART;VALUE=DATE:20261010/);
  assert.match(createCalendar(value,{matchId:'fd-102'}), /STATUS:TENTATIVE/);
  assert.equal((createCalendar(value,{competition:'CL'}).match(/BEGIN:VEVENT/g)||[]).length, 1);
  assert.match(createCalendar(value,{matchId:'fd-101'}), /UID:fd-101@/);
  assert.doesNotMatch(createCalendar(value,{matchId:'fd-101'}), /UID:fd-103@/);
});
test('RFC 5545 text escaping and UTF-8 folding prevent property injection', () => {
  assert.equal(escapeText('Barça, a;b\\c\r\nSTATUS:CANCELLED'), 'Barça\\, a\\;b\\\\c\\nSTATUS:CANCELLED');
  const text = 'SUMMARY:' + '⚽ Barça é '.repeat(40);
  const folded = foldLine(text);
  assert.equal(unfold(folded), text);
  for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  const value = snapshot([provider({venue:'Ground\nBEGIN:VEVENT',awayTeam:{id:82,name:'Getafe, CF',tla:'GET'}})]);
  const body = unfold(createCalendar(value));
  assert.match(body, /SUMMARY:Barcelona vs Getafe\\, CF/);
  assert.equal((body.match(/\r\nBEGIN:VEVENT\r\n/g)||[]).length,1);
  assert.ok(body.endsWith('END:VCALENDAR\r\n'));
  assert.doesNotMatch(body.replaceAll('\r\n',''), /[\r\n]/);
});
test('ETag conditional requests, HEAD and unavailable single-event exports', async () => {
  const value = snapshot([provider(),provider({id:102,status:'SCHEDULED'})]);
  const response = await calendarResponse(new Request('https://example.test/calendar/barca.ics'), value);
  assert.equal(response.status,200);
  assert.match(response.headers.get('Content-Type'), /^text\/calendar/);
  const cached = await calendarResponse(new Request('https://example.test/calendar/barca.ics',{headers:{'If-None-Match':'W/'+response.headers.get('ETag')}}), value);
  assert.equal(cached.status,304);
  assert.equal(await cached.text(),'');
  const head = await calendarResponse(new Request('https://example.test/calendar/barca.ics',{method:'HEAD'}), value);
  assert.equal(await head.text(),'');
  assert.equal((await calendarResponse(new Request('https://example.test'), value, {matchId:'fd-102'})).status,200);
  assert.equal((await calendarResponse(new Request('https://example.test'), value, {matchId:'absent'})).status,404);
  const single = await calendarResponse(new Request('https://example.test'),value,{matchId:'fd-101'});
  assert.match(single.headers.get('Content-Disposition'),/^attachment/);
});
test('date-only events retain identity when moved, timed, postponed or cancelled',()=>{
 const first=snapshot([provider({status:'SCHEDULED',utcDate:'2026-11-08T00:00:00Z'})]);
 const moved=snapshot([provider({status:'SCHEDULED',utcDate:'2026-11-09T00:00:00Z'})],first);
 assert.equal(moved.fixtures[0].sequence,first.fixtures[0].sequence+1);
 assert.match(createCalendar(moved),/DTSTART;VALUE=DATE:20261109\r\nDTEND;VALUE=DATE:20261110/);
 const timed=snapshot([provider({utcDate:'2026-11-09T20:00:00Z'})],moved);
 assert.match(createCalendar(timed),/UID:fd-101@cartel-barca.fixtures/);
 assert.match(createCalendar(timed),/DTSTART:20261109T200000Z/);
 assert.doesNotMatch(createCalendar(timed),/VALUE=DATE|Kickoff time pending/);
 for(const status of ['POSTPONED','CANCELLED']){
  const cancelled=snapshot([provider({status,utcDate:'2026-11-15T00:00:00Z'})],first);
  assert.match(createCalendar(cancelled),/DTSTART;VALUE=DATE:20261108/);
  assert.match(createCalendar(cancelled),/STATUS:CANCELLED/);
 }
});
test('calendar event notes stay brief, use known grounds and omit unknown locations',()=>{
 const value=snapshot([provider()]);
 const body=unfold(createCalendar(value,{venues:{81:{name:'Spotify Camp Nou',checkedAt:at}}}));
 assert.match(body,/LOCATION:Spotify Camp Nou/);
 assert.match(body,/DESCRIPTION:La Liga · Matchday 9\r\n/);
 assert.doesNotMatch(body,/Venue to be confirmed|Home ground|placeholder|Cup fixtures|Football data provided/);
 assert.doesNotMatch(createCalendar(value),/LOCATION:/);
});
test('malformed data and vanished fixtures cannot silently replace valid data', () => {
  const first = snapshot([provider()]);
  assert.throws(()=>snapshot([],first),/fixture missing/);
  assert.throws(()=>snapshot([provider(),provider()]),/Duplicate/);
  assert.throws(()=>snapshot([provider({score:{fullTime:{home:'<script>',away:0}}})]),/score/);
  assert.throws(()=>snapshot([provider({status:'UNKNOWN'})]),/status/);
  const old = snapshot([provider({utcDate:'2026-08-01T18:30:00Z',status:'FINISHED'})]);
  assert.equal(snapshot([],old).fixtures.length,0);
});
