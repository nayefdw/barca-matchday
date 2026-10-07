import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePhotoPreferences,selectPhotos} from '../public/photo-library.js';
const photos=[{id:'home-1'},{id:'home-2'},{id:'custom-photo'}];
test('the chosen favourite stays first within the photo limit and excluded photos never rotate',()=>{
 assert.deepEqual(selectPhotos(photos,{selected:'custom-photo',excluded:['home-2'],limit:1}),[{id:'custom-photo'}]);
 assert.deepEqual(selectPhotos(photos,{selected:'home-2',excluded:['home-2']}),[{id:'home-1'},{id:'custom-photo'}]);
 assert.deepEqual(selectPhotos(photos,{excluded:photos.map(photo=>photo.id)}),[]);
 assert.deepEqual(selectPhotos(photos,{selected:'removed-photo',limit:2}),photos.slice(0,2));
});
test('stored photo preferences tolerate malformed values without losing the default collection',()=>{
 assert.deepEqual(selectPhotos(photos,null),photos);
 assert.deepEqual(normalizePhotoPreferences({limit:-2,rotate:'false',excluded:'home-1',selected:4}),{limit:0,rotate:true,excluded:[],selected:''});
 assert.deepEqual(normalizePhotoPreferences({limit:26,excluded:['home-1','home-1',null],rotate:false}),{limit:0,rotate:false,excluded:['home-1'],selected:''});
 assert.deepEqual(selectPhotos(photos,{}),photos);
});
