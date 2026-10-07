import {writeFile} from 'node:fs/promises';
import {base64url} from '../worker/push.js';
const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const privateKey=await crypto.subtle.exportKey('jwk',pair.privateKey),publicKey=base64url(await crypto.subtle.exportKey('raw',pair.publicKey));
await writeFile('.vapid.json',JSON.stringify({publicKey,privateKey},null,2),{flag:'wx'});
console.log('Push keys saved to .vapid.json. Keep this file private; it is excluded from Git.');
