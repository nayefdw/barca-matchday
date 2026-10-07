import {CURATED_STADIUMS} from '../public/stadiums.js';
import {recentMeetings} from '../public/history.js';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sampleSnapshot, sampleTeam, sampleStandings } from './sample.js';
const root = path.resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const port = Number(process.env.PORT || 4187);
const demo = sampleSnapshot();
if(process.argv.includes('--live-preview')){
 const focus=demo.fixtures.find(f=>f.status==='TIMED'&&f.timeConfirmed&&Date.parse(f.kickoffUtc)>Date.now());
 if(focus){focus.status='IN_PLAY';focus.score={...focus.score,home:2,away:1};focus.kickoffUtc=new Date(Date.now()-1800000).toISOString();}
}
const team = sampleTeam();
try{const photos=JSON.parse(await readFile(new URL('./photo-sample.json',import.meta.url),'utf8'));for(const player of team.squad)player.photo=photos[player.name]||null;}catch{}
const empty = process.argv.includes('--empty');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json', '.webp':'image/webp' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if(url.pathname==='/api/push/config'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({ready:false,publicKey:null}));}
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405, { Allow:'GET, HEAD' }); return res.end(); }
  if(url.pathname==='/api/stadiums'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(req.method==='HEAD'?undefined:JSON.stringify({schemaVersion:1,stadiums:CURATED_STADIUMS}));}
  if(url.pathname==='/api/head-to-head'){
    const match=demo.fixtures.find(f=>f.id===url.searchParams.get('match'));
    const status=empty?503:match?200:404;
    res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});
    if(status!==200)return res.end(req.method==='HEAD'?undefined:JSON.stringify({error:'History unavailable'}));
    const rival=match.homeTeam.id===81?match.awayTeam:match.homeTeam,barca=match.homeTeam.id===81?match.homeTeam:match.awayTeam;
    const scores=[[2,0],[1,1],[0,1],[3,2]];
    const older=scores.map(([home,away],index)=>({id:'sample-history-'+rival.id+'-'+index,homeTeam:index%2? rival:barca,awayTeam:index%2?barca:rival,kickoffUtc:new Date(Date.now()-(150+index*180)*86400000).toISOString(),timeConfirmed:true,status:'FINISHED',competition:match.competition,competitionName:match.competitionName,score:{home,away,duration:'REGULAR',penalties:null}}));
    return res.end(req.method==='HEAD'?undefined:JSON.stringify({schemaVersion:1,matchId:match.id,opponentId:rival.id,checkedAt:new Date().toISOString(),demo:true,limited:false,stale:false,fixtures:recentMeetings([...older,...demo.fixtures],match)}));
  }
  if(url.pathname==='/api/standings'){
    const code=url.searchParams.get('competition')||'PD';
    const status=!['PD','CL'].includes(code)?400:empty?503:200;
    res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});
    return res.end(req.method==='HEAD'?undefined:JSON.stringify(status===200?sampleStandings(code):{error:'Standings unavailable'}));
  }
  if (['/api/fixtures','/api/team'].includes(url.pathname)) {
    res.writeHead(empty ? 503 : 200, { 'Content-Type':'application/json', 'Cache-Control':'no-store' });
    return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(empty ? { error:'Data not connected' } : url.pathname==='/api/team'?team:demo));
  }
  if (url.pathname.startsWith('/calendar/')) {
    res.writeHead(503, { 'Content-Type':'text/plain', 'Cache-Control':'no-store' });
    return res.end(req.method === 'HEAD' ? undefined : 'Illustrative preview fixtures cannot be exported or subscribed to.');
  }
  if (url.pathname.startsWith('/api/')) { res.writeHead(404); return res.end(); }
  try {
    const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); return res.end(); }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`Cartel preview: http://127.0.0.1:${port}\nIllustrative fixtures only. Public calendar subscriptions are disabled in the preview.\n`));
