export const TIME_ZONES=[
 ['Europe/Madrid','Barcelona'],
 ['Asia/Gaza','Palestine — Gaza'],
 ['Asia/Hebron','Palestine — West Bank'],
 ['America/Chicago','Chicago'],
 ['Europe/London','London'],
 ['Europe/Paris','Paris'],
 ['America/New_York','New York'],
 ['America/Los_Angeles','Los Angeles'],
 ['Asia/Riyadh','Riyadh'],
 ['Asia/Dubai','Dubai'],
 ['Asia/Tokyo','Tokyo'],
 ['UTC','UTC']
];
const choices=new Set(TIME_ZONES.map(([zone])=>zone));
function supported(zone){
 if(typeof zone!=='string'||!zone)return false;
 try{new Intl.DateTimeFormat('en-GB',{timeZone:zone});return true;}catch{return false;}
}
export function timezonePreference(value){
 const zone=value==='barcelona'?'Europe/Madrid':value;
 return choices.has(zone)&&supported(zone)?zone:'local';
}
export function deviceTimezone(){
 try{const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;return supported(zone)?zone:'UTC';}catch{return 'UTC';}
}
export function resolveTimezone(preference,detected=deviceTimezone()){
 const zone=timezonePreference(preference);
 return zone==='local'?(supported(detected)?detected:'UTC'):zone;
}
export function timezoneLabel(preference){
 const zone=timezonePreference(preference);
 return zone==='local'?'Phone time':TIME_ZONES.find(([id])=>id===zone)[1]+' time';
}
