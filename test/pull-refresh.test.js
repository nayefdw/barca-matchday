import test from 'node:test';
import assert from 'node:assert/strict';
import {pullProgress,installPullRefresh} from '../public/pull-refresh.js';
test('Windows mouse drag refreshes only after a deliberate downward release and ignores cancellation',async()=>{
 globalThis.window={scrollY:0};const listeners={},classes=new Set();let calls=0;
 const indicator={style:{setProperty(){},removeProperty(){}},classList:{add(...v){v.forEach(x=>classes.add(x));},remove(...v){v.forEach(x=>classes.delete(x));},contains:v=>classes.has(v),toggle(v,on){on?classes.add(v):classes.delete(v);}},querySelector:()=>({textContent:''})};
 installPullRefresh({indicator,target:{addEventListener(t,fn){listeners[t]=fn;}},refresh:async()=>calls++});
 const event=y=>({pointerType:'mouse',pointerId:1,button:0,buttons:1,clientX:20,clientY:y,target:{closest:()=>null},preventDefault(){}});
 listeners.pointerdown(event(100));listeners.pointermove(event(140));await listeners.pointerup(event(140));assert.equal(calls,0);
 listeners.pointerdown(event(100));listeners.pointermove(event(280));await listeners.pointerup(event(280));assert.equal(calls,1);
 listeners.pointerdown(event(100));listeners.pointermove(event(280));listeners.pointercancel();await listeners.pointerup(event(280));assert.equal(calls,1);delete globalThis.window;
});
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
