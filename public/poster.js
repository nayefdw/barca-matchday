import {upcoming,currentMatch} from './state.js';
import {finishedFixtures,dateKey,matchResult} from './insights.js';
export function mainPosterFixture(fixtures,confirmedAt,now=Date.now()) {
  const previous=finishedFixtures(fixtures)[0];
  const finalAt=Date.parse(previous?.summaryFinalAt||confirmedAt);
  const recent=previous?.status==='FINISHED'&&Number.isFinite(finalAt)&&now>=finalAt&&now-finalAt<10*60000?previous:null;
  return currentMatch(fixtures,now)||recent||upcoming(fixtures,now)[0]||previous;
}
export function nearbyFixtures(fixtures,focus,now=Date.now()) {
  const previous=finishedFixtures(fixtures).find(f=>Date.parse(f.kickoffUtc)<=now&&f.id!==focus.id);
  const next=upcoming(fixtures,now).filter(f=>f.id!==focus.id);
  return [{fixture:previous,label:'Previous'},{fixture:next[0],label:'Then'},{fixture:next[1],label:'After'}].filter(item=>item.fixture);
}
export function posterState(f,now=Date.now(),timeZone='Europe/Madrid') {
  const live=['IN_PLAY','PAUSED','SUSPENDED'].includes(f.status), finished=!!matchResult(f);
  const today=f.timeConfirmed&&dateKey(f.kickoffUtc,timeZone)===dateKey(now,timeZone);
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',hourCycle:'h23'}).format(new Date(f.kickoffUtc)));
  const unavailable=['POSTPONED','CANCELLED'].includes(f.status);
  return {live,finished,today,unavailable,tone:hour>=20||hour<6?'night':'dusk',
    title:finished?'Latest result':unavailable?(f.status==='POSTPONED'?'Postponed':'Cancelled'):live?'Match in progress':today?'Matchday':'Next tracked match'};
}
