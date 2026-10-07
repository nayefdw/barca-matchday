import {safePhoto,safePhotoCredit} from './photos.js';
export const CURATED_STADIUMS={
  "81": {
    "name": "Camp Nou",
    "article": "Camp Nou",
    "photo": {
      "url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/54/Camp_Nou_%28Barcelona%29_-_13.jpg/1280px-Camp_Nou_%28Barcelona%29_-_13.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
      "source": "https://commons.wikimedia.org/wiki/File:Camp_Nou_(Barcelona)_-_13.jpg",
      "author": "MARIA ROSA FERRE ✿",
      "license": "CC BY-SA 2.0"
    }
  },
  "524": {
    "name": "Parc des Princes",
    "article": "Parc des Princes",
    "photo": {
      "url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b4/Parc_des_princes_2018.jpg/1280px-Parc_des_princes_2018.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
      "source": "https://commons.wikimedia.org/wiki/File:Parc_des_princes_2018.jpg",
      "author": "Kilyac",
      "license": "CC BY-SA 4.0"
    }
  }
};
export function safeStadium(value){
 if(!value||typeof value.name!=='string'||!value.name.trim()||value.name.length>180||!safePhoto(value.photo?.url)||!safePhotoCredit(value.photo?.source)||typeof value.photo.author!=='string'||!value.photo.author||typeof value.photo.license!=='string'||!value.photo.license)return null;
 return value;
}
export function safeVenue(value){
 if(!value||typeof value.name!=='string'||!value.name.trim()||value.name.length>180||typeof value.checkedAt!=='string'||!Number.isFinite(Date.parse(value.checkedAt)))return null;
 return {name:value.name.trim(),checkedAt:value.checkedAt,source:'football-data.org'};
}
export function matchVenue(match,venues={}){
 const name=typeof match?.venue==='string'?match.venue.trim():'';
 if(name&&name.length<=180&&!/^(?:tbc|tbd|n\/a|unknown|venue to be confirmed)$/i.test(name))return {name,confirmed:true,source:'match'};
 const homeGround=safeVenue(venues[match?.homeTeam?.id]);
 return homeGround?{name:homeGround.name,confirmed:false,source:'club',note:'Club home ground · match venue not supplied'}:null;
}
export function stadiumArticle(venue){
 if(typeof venue!=='string'||!venue.trim()||venue.length>180||/[|\r\n]/.test(venue))return null;
 const key=venue.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const aliases={'spotify camp nou':'Camp Nou','camp nou':'Camp Nou','parc des princes':'Parc des Princes','estadio benito villamarin':'Benito Villamarín Stadium','estadio de la cartuja':'La Cartuja','estadio la cartuja':'La Cartuja','estadio olimpico lluis companys':'Estadi Olímpic Lluís Companys','coliseum alfonso perez':'Coliseum (stadium)','estadio coliseum':'Coliseum (stadium)','estadio mestalla':'Mestalla Stadium','mestalla':'Mestalla Stadium','ramon sanchez-pizjuan':'Ramón Sánchez Pizjuán Stadium','estadio ramon sanchez pizjuan':'Ramón Sánchez Pizjuán Stadium'};
 return aliases[key]||venue.trim();
}
