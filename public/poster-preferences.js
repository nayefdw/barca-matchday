export const POSTER_DEFAULTS={textSize:100,transparency:90};
export function posterPreferences(value){
 const number=(key,min,max)=>typeof value?.[key]==='number'&&Number.isFinite(value[key])?Math.max(min,Math.min(max,Math.round(value[key]/5)*5)):POSTER_DEFAULTS[key];
 return {textSize:number('textSize',85,120),transparency:number('transparency',0,100)};
}
export function posterStyle(value){
 const pref=posterPreferences(value);
 return {'--poster-scale':String(pref.textSize/100),'--poster-box-alpha':String((100-pref.transparency)/100),'--poster-box-blur':`${Math.round((100-pref.transparency)*.15)}px`};
}
