import test from 'node:test';
import assert from 'node:assert/strict';
import {pullProgress,installPullRefresh} from '../public/pull-refresh.js';
test('pull-to-refresh has resistance, a release threshold and a capped distance',()=>{
 assert.deepEqual(pullProgress(100,90),{distance:0,armed:false,progress:0});
 assert.equal(pullProgress(100,200).armed,false);assert.equal(pullProgress(100,250).armed,true);assert.equal(pullProgress(0,900).distance,110);
});
test('only a deliberate top-of-page downward release refreshes; modal and duplicate pulls are ignored',async()=>{
 const listeners={},classes=new Set();let calls=0,blocked=false,finish;
 globalThis.window={scrollY:0};
 const indicator={style:{setProperty(){},removeProperty(){}},classList:{add(...values){values.forEach(v=>classes.add(v));},remove(...values){values.forEach(v=>classes.delete(v));},contains:value=>classes.has(value),toggle(value,on){on?classes.add(value):classes.delete(value);}},querySelector:()=>({textContent:''})};
 installPullRefresh({indicator,target:{addEventListener(type,handler){listeners[type]=handler;}},blocked:()=>blocked,refresh:()=>{calls++;return new Promise(resolve=>finish=resolve);}});
 const touch=(y,x=0)=>({touches:[{clientY:y,clientX:x}],target:{closest:()=>null},preventDefault(){this.prevented=true;}});
 listeners.touchstart(touch(100));listeners.touchmove(touch(120));await listeners.touchend();assert.equal(calls,0);
 window.scrollY=20;listeners.touchstart(touch(100));listeners.touchmove(touch(300));await listeners.touchend();assert.equal(calls,0);
 window.scrollY=0;blocked=true;listeners.touchstart(touch(100));listeners.touchmove(touch(300));await listeners.touchend();assert.equal(calls,0);
 blocked=false;listeners.touchstart(touch(100));listeners.touchmove(touch(300,400));await listeners.touchend();assert.equal(calls,0);
 listeners.touchstart(touch(100));const move=touch(300);listeners.touchmove(move);assert.equal(move.prevented,true);const pending=listeners.touchend();assert.equal(calls,1);assert.ok(classes.has('refreshing'));
 listeners.touchstart(touch(100));listeners.touchmove(touch(300));await listeners.touchend();assert.equal(calls,1);
 finish();await pending;assert.equal(classes.has('refreshing'),false);delete globalThis.window;
});
