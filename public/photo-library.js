import {HOME_PHOTOS} from './home-photos.js';

const builtins=HOME_PHOTOS.map((photo,index)=>({...photo,id:`home-${index+1}`,name:`Camp Nou · ${index+1}`,builtin:true}));
export function normalizePhotoPreferences(value={}){
 if(!value||typeof value!=='object')value={};
 return {excluded:Array.isArray(value.excluded)?[...new Set(value.excluded.filter(id=>typeof id==='string'))]:[],limit:Number.isInteger(value.limit)&&value.limit>=1&&value.limit<=25?value.limit:0,rotate:value.rotate!==false,selected:typeof value.selected==='string'?value.selected:''};
}
export function selectPhotos(items,preferences){
 const prefs=normalizePhotoPreferences(preferences),enabled=items.filter(photo=>!prefs.excluded.includes(photo.id));
 const selected=enabled.find(photo=>photo.id===prefs.selected);
 const ordered=selected?[selected,...enabled.filter(photo=>photo!==selected)]:enabled;
 return prefs.limit?ordered.slice(0,prefs.limit):ordered;
}
export const photoLibrary={items:[...builtins],preferences:normalizePhotoPreferences(),available:false};
let database;
function transaction(mode,operation){return new Promise((resolve,reject)=>{
 const tx=database.transaction(['photos','preferences'],mode);let result;
 tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Photo storage unavailable'));
 operation(tx,value=>{result=value;});
});}
export async function loadPhotoLibrary(){
 try{
  database=await new Promise((resolve,reject)=>{const request=indexedDB.open('barca-poster-photos',1);request.onupgradeneeded=()=>{request.result.createObjectStore('photos',{keyPath:'id'});request.result.createObjectStore('preferences');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Photo storage is busy'));});
  const loaded=await transaction('readonly',(tx,done)=>{const photos=tx.objectStore('photos').getAll(),prefs=tx.objectStore('preferences').get('home');let count=0,result={};photos.onsuccess=()=>{result.photos=photos.result;if(++count===2)done(result);};prefs.onsuccess=()=>{result.preferences=prefs.result;if(++count===2)done(result);};});
  photoLibrary.items=[...builtins,...(loaded.photos||[]).slice(0,16).filter(photo=>photo.blob instanceof Blob&&['image/webp','image/jpeg','image/png'].includes(photo.blob.type)).map(photo=>({...photo,url:URL.createObjectURL(photo.blob),position:'center 50%',builtin:false}))];
  photoLibrary.preferences=normalizePhotoPreferences(loaded.preferences);photoLibrary.available=true;
 }catch{photoLibrary.available=false;}
 return photoLibrary;
}
export const activeHomePhotos=()=>selectPhotos(photoLibrary.items,photoLibrary.preferences);
export async function savePhotoPreferences(changes){
 if(!photoLibrary.available)throw new Error('Photo storage is unavailable in this browser.');
 const next=normalizePhotoPreferences({...photoLibrary.preferences,...changes});
 await transaction('readwrite',tx=>tx.objectStore('preferences').put(next,'home'));photoLibrary.preferences=next;
}
export async function addHomePhoto(file){
 if(!photoLibrary.available)throw new Error('Photo storage is unavailable in this browser.');
 if(photoLibrary.items.length>=25)throw new Error('Remove a custom photo first. You can keep up to 16 custom photos.');
 if(!file||!['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type))throw new Error('Choose a photo in JPEG, PNG or WebP format.');
 if(file.size>20*1024*1024)throw new Error('Choose a photo smaller than 20 MB.');
 const input=URL.createObjectURL(file),image=new Image();
 try{image.src=input;try{await image.decode();}catch{throw new Error('This photo format could not be opened. Try a JPEG or PNG copy.');}
  const scale=Math.min(1,1200/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));if(!blob)throw new Error('The photo could not be saved.');
  const photo={id:crypto.randomUUID(),name:file.name.slice(0,100),blob};
  const next=normalizePhotoPreferences({...photoLibrary.preferences,selected:photo.id});
  await transaction('readwrite',tx=>{tx.objectStore('photos').put(photo);tx.objectStore('preferences').put(next,'home');});
  photoLibrary.items.push({...photo,url:URL.createObjectURL(blob),position:'center 50%',builtin:false});photoLibrary.preferences=next;
 }finally{URL.revokeObjectURL(input);}
}
export async function removeHomePhoto(id){
 const photo=photoLibrary.items.find(photo=>photo.id===id);if(!photo)return;
 if(photo.builtin){await savePhotoPreferences({excluded:[...photoLibrary.preferences.excluded,id]});return;}
 const next=normalizePhotoPreferences({...photoLibrary.preferences,excluded:photoLibrary.preferences.excluded.filter(key=>key!==id),selected:photoLibrary.preferences.selected===id?'':photoLibrary.preferences.selected});
 await transaction('readwrite',tx=>{tx.objectStore('photos').delete(id);tx.objectStore('preferences').put(next,'home');});
 photoLibrary.items=photoLibrary.items.filter(item=>item!==photo);photoLibrary.preferences=next;URL.revokeObjectURL(photo.url);
}
