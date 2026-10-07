import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlayerProfile,enrichPlayerProfiles} from '../worker/player-profiles.js';
const checkedAt='2026-10-07T06:00:00Z';
const page=(club='[[FC Barcelona|Barcelona]]')=>({title:'Lamine Yamal',revisions:[{slots:{main:{content:`{{Infobox football biography
| birth_date = {{birth date and age|2007|7|13|df=y}}
| birth_place = [[Esplugues de Llobregat]], Spain<ref>Reference</ref>
| height = 1.78 m<ref name="bio"/>
| position = [[Winger (association football)|Winger]]
| currentclub = ${club}
| clubnumber = 10
}}`}}}]});
test('biography gives exact date, clean facts and a number associated with Barcelona',()=>{
 const profile=parsePlayerProfile(page(),checkedAt);
 assert.equal(profile.shirtNumber,10);assert.equal(profile.born,'2007-07-13');assert.equal(profile.heightMeters,1.78);
 assert.equal(profile.position,'Winger');assert.equal(profile.birthplace,'Esplugues de Llobregat, Spain');
 assert.equal(profile.sourceUrl,'https://en.wikipedia.org/wiki/Lamine_Yamal');
});
test('other-club and reserve numbers never become Barcelona first-team shirt numbers',()=>{
 assert.equal(parsePlayerProfile(page('[[Newcastle United F.C.|Newcastle United]]'),checkedAt).shirtNumber,null);
 const reserve=parsePlayerProfile(page('[[FC Barcelona Atlètic|Barcelona B]]'),checkedAt);assert.equal(reserve.shirtNumber,null);assert.equal(reserve.clubNumber,10);
 assert.equal(parsePlayerProfile({...page(),missing:true},checkedAt),null);
 assert.equal(parsePlayerProfile({...page(),pageprops:{disambiguation:''}},checkedAt),null);
});
test('invalid dates and heights stay unknown, and saved biographies survive an outage',async()=>{
 const bad=page();bad.revisions[0].slots.main.content=bad.revisions[0].slots.main.content.replace('2007|7|13','2007|2|31').replace('1.78 m','9.78 m');
 assert.equal(parsePlayerProfile(bad,checkedAt).born,null);assert.equal(parsePlayerProfile(bad,checkedAt).heightMeters,null);
 const team={squad:[{id:1,name:'Lamine Yamal',shirtNumber:null}]},previous={squad:[{...team.squad[0],profile:parsePlayerProfile(page(),checkedAt)}]};
 const updated=await enrichPlayerProfiles(team,previous,{fetcher:async()=>{throw new Error('Offline');}});
 assert.equal(updated.squad[0].shirtNumber,10);assert.equal(updated.squad[0].shirtNumberSource,'Wikipedia');
});
