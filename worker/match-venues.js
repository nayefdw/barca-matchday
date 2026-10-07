// Venues listed on the official first-team schedule, checked 7 October 2026.
// Exact fixture/date/team guards prevent carrying an old venue onto a new fixture.
export const VENUE_SOURCE='https://www.fcbarcelona.com/en/football/first-team/schedule';
const records={
 'fd-564700':['2026-10-10',81,82,'Spotify Camp Nou'],
 'fd-575344':['2026-10-13',610,81,'RAMS Park'],
 'fd-564713':['2026-10-17',90,81,'Estadio La Cartuja de Sevilla'],
 'fd-575367':['2026-10-20',524,81,'Parc des Princes'],
 'fd-564723':['2026-10-25',81,86,'Spotify Camp Nou'],
 'fd-564732':['2026-10-31',81,263,'Spotify Camp Nou'],
 'fd-575380':['2026-11-03',81,58,'Spotify Camp Nou'],
 'fd-564746':['2026-11-08',78,81,'Riyadh Air Metropolitano'],
 'fd-564749':['2026-11-22',81,94,'Spotify Camp Nou'],
 'fd-575404':['2026-11-25',10233,81,'Baku Olympic Stadium'],
 'fd-564766':['2026-11-29',560,81,'ABANCA-Riazor']
};
export function officialVenue(f){
 const record=records[f.id];
 if(f.venue?.trim()&&!/^(?:tbc|tbd|n\/a|unknown|venue to be confirmed)$/i.test(f.venue.trim()))return f;
 if(!record||f.kickoffUtc.slice(0,10)!==record[0]||f.homeTeam.id!==record[1]||f.awayTeam.id!==record[2])return f;
 return {...f,venue:record[3],venueSource:VENUE_SOURCE,venueCheckedAt:'2026-10-07T13:23:14Z'};
}
