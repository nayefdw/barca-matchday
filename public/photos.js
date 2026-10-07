const key=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases=[
 ['Joan García',['Joan García','Joan Garcia Pons']],['Alejandro Balde',['Alejandro Balde','Alejandro Balde Martínez']],
 ['Pau Cubarsí',['Pau Cubarsí','Pau Cubarsi Paredes']],['Jules Koundé',['Jules Koundé','Jules Olivier Koundé']],
 ['Gavi (footballer)',['Gavi','Pablo Martín Páez Gavira']],['Pedri',['Pedri','Pedro González López']],
 ['Lamine Yamal',['Lamine Yamal','Lamine Yamal Nasraoui Ebana']],['Raphinha',['Raphinha','Raphael Dias Belloli']],
 ['Robert Lewandowski',['Robert Lewandowski']],['Ferran Torres',['Ferran Torres','Ferran Torres García']],
 ['Marcus Rashford',['Marcus Rashford']],['Dani Olmo',['Dani Olmo','Daniel Olmo Carvajal']],
 ['Eric García',['Eric García','Eric García Martret']],['Frenkie de Jong',['Frenkie de Jong']],
 ['Ronald Araújo',['Ronald Araújo','Ronald Federico Araújo da Silva']],['Andreas Christensen',['Andreas Christensen','Andreas Bødtker Christensen']],
 ['Marc Bernal',['Marc Bernal','Marc Bernal Casas']],['Marc Casadó',['Marc Casadó','Marc Casadó Torras']],
 ['Fermín López',['Fermín López','Fermín López Marín']],['Roony Bardghji',['Roony Bardghji']],
 ['Wojciech Szczęsny',['Wojciech Szczęsny']],['Marc-André ter Stegen',['Marc-André ter Stegen']],
 ['Gerard Martín',['Gerard Martín','Gerard Martín Langreo']]
];
const titles=new Map(aliases.flatMap(([title,names])=>names.map(name=>[key(name),title])));
export const playerArticle=name=>typeof name==='string'?titles.get(key(name))||null:null;
export function safePhoto(value){
 try{const url=new URL(value);if(url.protocol!=='https:'||!['upload.wikimedia.org','thumb.wikimedia.org'].includes(url.hostname)||!url.pathname.startsWith('/wikipedia/commons/'))return null;url.search='';return url.href;}catch{return null;}
}
export function safePhotoCredit(value){try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='commons.wikimedia.org'&&url.pathname.startsWith('/wiki/File:')?url.href:null;}catch{return null;}}
