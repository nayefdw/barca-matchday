import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {reminderTitle} from '../worker/push.js';
const now=Date.parse('2026-10-13T18:30:00Z');
test('reminder wording uses remaining minutes, hours or days and correct singular units',()=>{
 for(const [minutes,text] of [[15,'15 minutes'],[30,'30 minutes'],[60,'1 hour'],[120,'2 hours'],[1440,'1 day'],[1,'1 minute'],[61,'1 hour 1 minute']]){
  assert.equal(reminderTitle(new Date(now+minutes*60000).toISOString(),now),'Barca match is after '+text);
 }
 assert.equal(reminderTitle(new Date(now+30*60000).toISOString(),now+5*60000),'Barca match is after 25 minutes');
});
async function show(payload){
 const handlers=new Map(),shown=[];let pending;
 runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),{
  self:{location:{origin:'https://barca.example'},addEventListener:(type,handler)=>handlers.set(type,handler),registration:{showNotification:async(title,options)=>shown.push({title,options})}},
  URL,Date:{parse:Date.parse,now:()=>now}
 });
 handlers.get('push')({data:{json:()=>payload},waitUntil:promise=>pending=promise});await pending;return shown[0];
}
test('shown reminders contain only the message title with no body or match details',async()=>{
 const result=await show({title:'Barca match is after 30 minutes',body:'Barcelona vs Getafe',competition:'La Liga',url:'https://barca.example/?match=fd-1#match'});
 assert.equal(result.title,'Barca match is after 30 minutes');assert.equal(result.options.body,undefined);
 assert.equal(result.options.data.url,'https://barca.example/?match=fd-1#match');
 assert.deepEqual(Object.keys(result.options).sort(),['badge','data','icon','tag']);
});
test('old queued reminders also lose their teams, kickoff line and competition',async()=>{
 const result=await show({title:'Barça · Matchday',body:'Barcelona vs Getafe',competition:'La Liga',kickoffUtc:new Date(now+30*60000).toISOString()});
 assert.equal(result.title,'Barca match is after 30 minutes');assert.equal(result.options.body,undefined);
});
test('notification tests stay clearly labelled and details are suppressed',async()=>{
 const result=await show({test:true,title:'Barca notification test',body:'old details',tag:'barca-test'});
 assert.equal(result.title,'Barca notification test');assert.equal(result.options.body,undefined);
});
test('existing install metadata and app identity remain unchanged',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.name,'Barça Matchday');assert.equal(manifest.short_name,'Barça');assert.equal(manifest.id,'/');
});
