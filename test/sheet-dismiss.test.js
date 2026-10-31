import test from 'node:test';
import assert from 'node:assert/strict';
import {installSheetDismiss} from '../public/sheet-dismiss.js';
function setup(){
 const listeners={},classes=new Set(),style={};let closes=0,captured=null;
 const dialog={open:true,scrollTop:0,style:{set transform(v){style.transform=v;},removeProperty(k){delete style[k];}},classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},addEventListener(t,fn){listeners[t]=fn;},setPointerCapture(id){captured=id;},hasPointerCapture:id=>captured===id,releasePointerCapture(){captured=null;},close(){this.open=false;closes++;listeners.close();}};
 const reset=installSheetDismiss(dialog);
 const event=(y,{x=100,header=true,interactive=false,pointerType='mouse'}={})=>({pointerId:1,pointerType,button:0,clientX:x,clientY:y,target:{closest(selector){return selector.startsWith('button')?interactive:header;}},preventDefault(){}});
 return {dialog,listeners,event,reset,get closes(){return closes;},style};
}
test('Windows dragging a dialog down closes it once and clears visual/capture state',()=>{
 const s=setup();s.listeners.pointerdown(s.event(100));s.listeners.pointermove(s.event(100));s.listeners.pointermove(s.event(240));assert.equal(s.style.transform,'translateY(112px)');s.listeners.pointerup(s.event(240));assert.equal(s.closes,1);assert.equal(s.style.transform,undefined);
});
test('short, horizontal, cancelled and interactive drags preserve an open dialog',()=>{
 for(const mode of ['short','horizontal','cancel','input','scrolled']){
  const s=setup(),options={interactive:mode==='input',header:mode!=='scrolled'};if(mode==='scrolled')s.dialog.scrollTop=100;
  s.listeners.pointerdown(s.event(100,options));s.listeners.pointermove(s.event(mode==='short'?130:240,{...options,x:mode==='horizontal'?400:100}));if(mode==='cancel')s.listeners.pointercancel();s.listeners.pointerup(s.event(240));assert.equal(s.closes,0,mode);assert.equal(s.style.transform,undefined);
 }
});
