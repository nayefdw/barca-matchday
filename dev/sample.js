import { normalizeMatches, COVERAGE } from '../worker/normalize.js';
import { normalizeStandings } from '../worker/standings.js';
export function sampleSnapshot(now = Date.now()) {
  const kickoff = (days, hour = 18, minute = 30) => {
    const value = new Date(now + days * 86400000);
    value.setUTCHours(hour, minute, 0, 0);
    return value.toISOString();
  };
  const barca = { id: 81, name: 'FC Barcelona', shortName: 'Barcelona', tla: 'FCB', crest:'https://crests.football-data.org/81.svg' };
  const teams = {
    getafe: { id: 82, name: 'Getafe CF', shortName: 'Getafe', tla: 'GET', crest:'https://crests.football-data.org/82.png' },
    psg: { id: 524, name: 'Paris Saint-Germain', shortName: 'Paris SG', tla: 'PSG', crest:'https://crests.football-data.org/524.svg' },
    valencia: { id: 95, name: 'Valencia CF', shortName: 'Valencia', tla: 'VAL', crest:'https://crests.football-data.org/95.svg' },
    betis: { id: 90, name: 'Real Betis Balompié', shortName: 'Real Betis', tla: 'BET', crest:'https://crests.football-data.org/90.png' },
    sevilla: { id: 559, name: 'Sevilla FC', shortName: 'Sevilla', tla: 'SEV', crest:'https://crests.football-data.org/559.svg' }
  };
  const match = (id, team, days, status, home, competition = 'PD', score = [null, null]) => ({
    id, utcDate: kickoff(days), status, competition: { code: competition },
    homeTeam: home ? barca : teams[team], awayTeam: home ? teams[team] : barca,
    matchday: id - 100, score: { fullTime: { home: score[0], away: score[1] }, duration: 'REGULAR' }
  });
  const checkedAt = new Date(now).toISOString();
  const fixtures = normalizeMatches({ matches: [
    match(101, 'getafe', 3, 'TIMED', true),
    match(102, 'psg', 7, 'TIMED', false, 'CL'),
    match(103, 'valencia', 10, 'TIMED', true),
    match(104, 'betis', 16, 'SCHEDULED', false),
    match(105, 'sevilla', 21, 'POSTPONED', true),
    match(106, 'betis', -4, 'FINISHED', true, 'PD', [3, 1]),
    match(107, 'valencia', -8, 'FINISHED', false, 'PD', [1, 1]),
    match(108, 'psg', -12, 'FINISHED', true, 'CL', [1, 2]),
    match(109, 'sevilla', -17, 'FINISHED', false, 'PD', [0, 2]),
    match(110, 'getafe', -21, 'FINISHED', true, 'PD', [4, 0])
  ] }, null, checkedAt);
  return { schemaVersion: 1, checkedAt, coverage: COVERAGE, fixtures, demo: true, stale: false, refreshFailed: false, calendarReady: false, calendarUrl: null };
}
export function sampleTeam(now=Date.now()) {
  // Illustrative selection for visual review; production uses the provider roster.
  const players=[['Joan García','Goalkeeper',1],['Alejandro Balde','Defender',3],['Pau Cubarsí','Defender',5],['Jules Koundé','Defender',23],['Gavi','Midfielder',6],['Pedri','Midfielder',8],['Lamine Yamal','Forward',10],['Raphinha','Forward',11]];
  return {schemaVersion:1,checkedAt:new Date(now).toISOString(),demo:true,team:{id:81,name:'FC Barcelona',crest:'https://crests.football-data.org/81.svg'},coach:'Hansi Flick',squad:players.map(([name,position,shirtNumber],index)=>({id:7001+index,name,position,shirtNumber,nationality:null})),stale:false};
}
export function sampleStandings(code,now=Date.now()){
 const teams=code==='PD'?[[86,'Real Madrid CF'],[81,'FC Barcelona'],[78,'Club Atlético de Madrid'],[94,'Villarreal CF'],[77,'Athletic Club'],[90,'Real Betis Balompié'],[559,'Sevilla FC'],[95,'Valencia CF']]:[[5,'FC Bayern München'],[524,'Paris Saint-Germain'],[64,'Liverpool FC'],[57,'Arsenal FC'],[86,'Real Madrid CF'],[81,'FC Barcelona'],[108,'FC Internazionale Milano'],[4,'Borussia Dortmund']];
 const rows=teams.map(([id,name],index)=>{const won=code==='PD'?8-index:[3,3,2,2,2,1,1,0][index],draw=code==='PD'?index%2:[0,0,1,0,0,1,0,2][index],lost=(code==='PD'?10:3)-won-draw,goalsFor=22-index,goalsAgainst=6+index;return {position:index+1,team:{id,name,crest:`https://crests.football-data.org/${id}.${id===90?'png':'svg'}`},playedGames:won+draw+lost,won,draw,lost,points:won*3+draw,goalsFor,goalsAgainst,goalDifference:goalsFor-goalsAgainst};});
 return {...normalizeStandings({competition:{code},season:{startDate:'2026-07-01',endDate:'2027-06-30'},standings:[{type:'TOTAL',stage:code==='PD'?'REGULAR_SEASON':'LEAGUE_STAGE',group:null,table:rows}]},code,new Date(now).toISOString()),demo:true,stale:false};
}
