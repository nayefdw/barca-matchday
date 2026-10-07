import test from 'node:test';
import assert from 'node:assert/strict';
import {bounded,startPushSubscription,notificationError} from '../public/notifications.js';
test('push subscribes synchronously from the click before any asynchronous setup',async()=>{
 let subscribed=false;
 const result=startPushSubscription({active:true,pushManager:{subscribe(options){subscribed=true;assert.equal(options.userVisibleOnly,true);assert.deepEqual([...options.applicationServerKey],[1,2,3]);return Promise.resolve('subscription');}}},'AQID');
 assert.equal(subscribed,true);assert.equal(await result,'subscription');
 const existing={endpoint:'saved'};assert.equal(await startPushSubscription(null,null,existing),existing);
 assert.throws(()=>startPushSubscription(null,'AQID'),/still loading/);
});
test('notification setup has a bounded wait and actionable denied/unsupported messages',async()=>{
 await assert.rejects(bounded(new Promise(()=>{}),5,'Timed out'),/Timed out/);
 assert.equal(await bounded(Promise.resolve('ready'),50),'ready');
 assert.match(notificationError({},'denied'),/device notification settings/);
 assert.match(notificationError({name:'NotAllowedError'}),/Home Screen/);
 assert.match(notificationError({name:'NotSupportedError'}),/Safari/);
});
