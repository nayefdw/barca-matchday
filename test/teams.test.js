import test from 'node:test';
import assert from 'node:assert/strict';
import { clubTeam, safeCrest } from '../public/teams.js';
test('full club names and provider crest URLs are kept together',()=>{
 const team=clubTeam({id:81,name:'FC Barcelona',shortName:'Barcelona',tla:'FCB',crest:'https://crests.football-data.org/81.svg'});
 assert.equal(team.name,'FC Barcelona');assert.equal(team.shortName,'Barcelona');assert.equal(team.crest,'https://crests.football-data.org/81.svg');
});
test('crest URL handling rejects inline markup and unrelated hosts',()=>{
 for(const url of ['javascript:alert(1)','data:image/svg+xml,<svg/>','https://example.test/logo.svg','http://crests.football-data.org/81.svg','https://crests.football-data.org@evil.test/81.svg','https://crests.football-data.org:8443/81.svg'])assert.equal(safeCrest(url),null);
 assert.equal(safeCrest('https://upload.wikimedia.org/wikipedia/en/a/aa/Example.svg'),'https://upload.wikimedia.org/wikipedia/en/a/aa/Example.svg');
 assert.equal(safeCrest(null),null);
});
