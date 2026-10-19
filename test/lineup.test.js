import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLineups} from '../worker/match-summary.js';
import {lineupPanel} from '../public/lineup.js';
import {posterPreferences,posterStyle} from '../public/poster-preferences.js';
const players=Array.from({length:11},(_,i)=>({id:i+1,name:{display:i===0?'Joan García':'Player '+(i+1)},matchShirtNumber:i+1,matchPosition:i===0?'G':i<5?'D':i<8?'M':'F',captain:i===3}));
const record={teams:[{team:{id:49,name:'FC Barcelona'}},{team:{id:44,name:'Opponent'}}],teamLists:[{teamId:49,lineup:players,substitutes:[{id:20,name:{display:'Substitute'},matchShirtNumber:20,matchPosition:'F'}]}]};
const fixture={homeTeam:{id:81,name:'FC Barcelona'},awayTeam:{id:82,name:'Opponent'}};
test('lineups join the correct team, preserve match shirt numbers and reject duplicates',()=>{
 const result=normalizeLineups(record);assert.equal(result.length,1);assert.equal(result[0].confirmed,true);assert.equal(result[0].starters[3].captain,true);assert.equal(result[0].substitutes[0].number,20);
 assert.deepEqual(normalizeLineups({...record,teamLists:[{...record.teamLists[0],teamId:999}]}),[]);
 assert.deepEqual(normalizeLineups({...record,teamLists:[{...record.teamLists[0],lineup:[...players,players[0]]}]}),[]);
 assert.equal(normalizeLineups({...record,teamLists:[{...record.teamLists[0],lineup:players.slice(0,8)}]})[0].confirmed,false);
});
test('pitch uses confirmed players only, labels positional layout and handles unavailable squads safely',()=>{
 const lineups=normalizeLineups(record),html=lineupPanel(fixture,{lineups});
 assert.equal((html.match(/class="pitch-player"/g)||[]).length,11);assert.ok(html.includes('tactical formation not supplied'));assert.ok(html.includes('Substitutes'));assert.ok(html.includes('aria-label="Captain"'));
 assert.ok(!lineupPanel(fixture,{lineups:[{...lineups[0],confirmed:false}]}).includes('football-pitch'));
 lineups[0].starters[0].name='<img onerror=alert(1)>';
 assert.ok(lineupPanel(fixture,{lineups}).includes('&lt;img'));assert.ok(!lineupPanel(fixture,{lineups}).includes('<img onerror'));
 assert.ok(lineupPanel(fixture,null,{failed:true}).includes('Could not check'));
});
test('poster settings reject corrupt stored values and clamp size and transparency',()=>{
 assert.deepEqual(posterPreferences({textSize:'evil',transparency:NaN}),{textSize:100,transparency:90});
 assert.deepEqual(posterPreferences({textSize:900,transparency:-20}),{textSize:120,transparency:0});
 assert.equal(posterStyle({textSize:120,transparency:100})['--poster-box-alpha'],'0');
 assert.equal(posterStyle({textSize:120,transparency:100})['--poster-scale'],'1.2');
});
