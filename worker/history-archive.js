// Verified score facts supplement the free provider's short historical window.
// Only the calendar date is known here; the UI must format dateOnly records in UTC.
// Scores and dates were checked against the linked official records on 2026-10-07.
const uefa=(competition,id,slug)=>`https://www.uefa.com/${competition}/match/${id}--${slug}/`;
const galaSource='https://www.uefa.com/news-media/mediaservices/informationkits/competitions/uefachampionsleague/2027/match/2049576/printmatchpresskits/';
const villaSuperCup='https://www.uefa.com/uefasupercup/history/1982/';
// [date, Barcelona at home, home goals, away goals, competition, title, source, URL, duration]
const archive={
 610:[
  ['2022-03-17',false,1,2,'EL','Europa League','UEFA',galaSource],
  ['2022-03-10',true,0,0,'EL','Europa League','UEFA',galaSource],
  ['2002-11-13',true,3,1,'CL','Champions League','UEFA',uefa('uefachampionsleague',70160,'barcelona-vs-galatasaray')],
  ['2002-09-24',false,0,2,'CL','Champions League','UEFA',uefa('uefachampionsleague',70152,'galatasaray-vs-barcelona')],
  ['2002-03-19',false,0,1,'CL','Champions League','UEFA',uefa('uefachampionsleague',68637,'galatasaray-vs-barcelona')]
 ],
 65:[
  ['2022-08-24',true,3,3,'FRIENDLY','Charity friendly','FC Barcelona','https://www.fcbarcelona.com/en/football/first-team/news/2759138/barca-3-3-manchester-city-charity-goals-galore'],
  ['2016-11-01',false,3,1,'CL','Champions League','UEFA',uefa('uefachampionsleague',2019335,'man-city-vs-barcelona')],
  ['2016-10-19',true,4,0,'CL','Champions League','UEFA',uefa('uefachampionsleague',2019327,'barcelona-vs-man-city')],
  ['2015-03-18',true,1,0,'CL','Champions League','UEFA',uefa('uefachampionsleague',2014414,'barcelona-vs-man-city')],
  ['2015-02-24',false,1,2,'CL','Champions League','UEFA',uefa('uefachampionsleague',2014404,'man-city-vs-barcelona')],
  ['2014-03-12',true,2,1,'CL','Champions League','UEFA',uefa('uefachampionsleague',2011865,'barcelona-vs-man-city')]
 ],
 498:[
  ['2017-12-05',true,2,0,'CL','Champions League','UEFA',uefa('uefachampionsleague',2021673,'barcelona-vs-sporting-cp')],
  ['2017-09-27',false,0,1,'CL','Champions League','UEFA',uefa('uefachampionsleague',2021617,'sporting-cp-vs-barcelona')],
  ['2008-11-26',false,2,5,'CL','Champions League','UEFA',uefa('uefachampionsleague',302758,'sporting-cp-vs-barcelona')],
  ['2008-09-16',true,3,1,'CL','Champions League','UEFA',uefa('uefachampionsleague',302702,'barcelona-vs-sporting-cp')]
 ],
 675:[
  ['1974-11-05',true,3,0,'CL','European Cup','UEFA',uefa('uefachampionsleague',63244,'barcelona-vs-feyenoord')],
  ['1974-10-22',false,0,0,'CL','European Cup','UEFA',uefa('uefachampionsleague',63243,'feyenoord-vs-barcelona')]
 ],
 58:[
  ['1983-01-26',false,3,0,'SC','UEFA Super Cup','UEFA',villaSuperCup,'EXTRA_TIME'],
  ['1983-01-19',true,1,0,'SC','UEFA Super Cup','UEFA',villaSuperCup],
  ['1978-03-15',true,2,1,'EL','UEFA Cup','UEFA',uefa('uefaeuropaleague',65078,'barcelona-vs-aston-villa')],
  ['1978-03-01',false,2,2,'EL','UEFA Cup','UEFA',uefa('uefaeuropaleague',65077,'aston-villa-vs-barcelona')]
 ],
 7397:[
  ['2025-08-10',true,5,0,'FRIENDLY','Joan Gamper Trophy · friendly','FC Barcelona','https://players.fcbarcelona.com/en/match/f2589079-barcelona-como']
 ]
};
export function archivedMeetings(match){
 const barca=[match.homeTeam,match.awayTeam].find(t=>t.id===81),opponent=[match.homeTeam,match.awayTeam].find(t=>t.id!==81);
 if(!barca||!opponent)return [];
 return (archive[opponent.id]||[]).map(([date,home,homeGoals,awayGoals,competition,competitionName,source,sourceUrl,duration='REGULAR'])=>({id:`archive-${opponent.id}-${date}`,homeTeam:home?barca:opponent,awayTeam:home?opponent:barca,kickoffUtc:date+'T00:00:00Z',dateOnly:true,timeConfirmed:false,status:'FINISHED',competition,competitionName,source,sourceUrl,score:{home:homeGoals,away:awayGoals,duration,penalties:null}}));
}
export function mergeHistory(primary,archived){
 const identity=f=>[f.kickoffUtc?.slice(0,10),f.homeTeam?.id,f.awayTeam?.id].join(':');
 const records=new Map();for(const f of primary)records.set(identity(f),f);
 for(const f of archived)if(!records.has(identity(f)))records.set(identity(f),f);
 return [...records.values()];
}
