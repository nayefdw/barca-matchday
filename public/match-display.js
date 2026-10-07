export function countdownClock(f,now=Date.now()){
 if(!f?.timeConfirmed||f.status!=='TIMED')return null;
 const seconds=Math.floor((Date.parse(f.kickoffUtc)-now)/1000);
 if(!Number.isFinite(seconds)||seconds<=0)return null;
 return {days:Math.floor(seconds/86400),hours:Math.floor(seconds%86400/3600),minutes:Math.floor(seconds%3600/60),seconds:seconds%60};
}
export function livePresentation(f){
 const active=['IN_PLAY','PAUSED'].includes(f?.status),hasScore=Number.isInteger(f?.score?.home)&&Number.isInteger(f?.score?.away);
 return {active,label:f?.status==='PAUSED'?'Half-time':'LIVE',score:hasScore?`${f.score.home}–${f.score.away}`:'–',hasScore};
}
export function clockFormat(options,format='24'){
 return options.hour||options.timeStyle?{...options,hourCycle:format==='12'?'h12':'h23'}:options;
}
