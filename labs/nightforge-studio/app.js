const $ = (s) => document.querySelector(s);
const hashString = (value) => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
};
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const titleCase = (s) => s.replace(/\b\w/g, c => c.toUpperCase());

const agents = [
  {id:'signal',name:'Signal',role:'Trend Scout',accent:'#67e8f9',desc:'distills a creative spark into safe, usable signals',shift:'02:30'},
  {id:'maestro',name:'Maestro',role:'Creative Director',accent:'#a78bfa',desc:'turns the signal into one mechanic-first pitch',shift:'02:40'},
  {id:'forge',name:'Forge',role:'Game Builder',accent:'#c9ff4f',desc:'creates the playable artifact from a governed template',shift:'03:00'},
  {id:'loop',name:'Loop',role:'Game Improver',accent:'#ffc857',desc:'runs three focused improvement passes',shift:'03:10'},
  {id:'lint',name:'Lint',role:'Housekeeper',accent:'#7dd3fc',desc:'checks structure, state, controls and deterministic integrity',shift:'03:25'},
  {id:'probe',name:'Probe',role:'QA Inspector',accent:'#ff637d',desc:'scores the build independently; cannot edit it',shift:'03:35'},
  {id:'conductor',name:'Conductor',role:'Orchestrator',accent:'#f9a8d4',desc:'moves signed evidence through release gates',shift:'04:00'},
  {id:'relay',name:'Relay',role:'Publisher',accent:'#86efac',desc:'updates catalog, change history and launch receipt',shift:'04:10'}
];

const pipelineSpec = [
  ['Signal','RESEARCH','Extract bounded creative signal'],
  ['Maestro','PITCH','Choose mechanic before theme'],
  ['Forge','BUILD','Generate playable artifact'],
  ['Loop','ITERATE ×3','Tune pacing, feedback and difficulty'],
  ['Lint','HOUSEKEEP','Validate structure and controls'],
  ['Probe','QA','Independent scored acceptance'],
  ['Conductor','GATE','Verify receipts and provenance'],
  ['Relay','PUBLISH','Add only passing build to catalog']
];

const nouns = ['Circuit','Drift','Spire','Courier','Beacon','Shard','Harbor','Pulse','Vault','Relay','Halo','Rift'];
const prefixes = ['Afterlight','Storm','Neon','Wild','Zero','Last','Glass','Iron','Echo','Night','Sky','Ember'];
const genres = ['Arcade survival','Action collector','Arena dodger','Score attack'];
const colors = [['#67e8f9','#a78bfa'],['#c9ff4f','#67e8f9'],['#ff637d','#ffc857'],['#a78bfa','#f9a8d4'],['#86efac','#67e8f9']];

const seedGames = [{
  id:'nf-0001',title:'Afterlight Courier',genre:'Arcade survival',theme:'a storm-powered courier crossing a floating city',
  pitch:'Thread a courier craft through collapsing sky lanes, collect charge cores, and bank a combo before the storm closes in.',
  seed:1337,qa:94,mechanic:95,controls:96,stability:93,mobile:91,colorA:'#67e8f9',colorB:'#a78bfa',iterations:4,shipped:new Date().toISOString()
}];

let games = loadGames();
let receipts = [];
let currentGame = null;
let animationId = null;

function loadGames(){
  try { const saved = JSON.parse(localStorage.getItem('nightforge.games')||'null'); return Array.isArray(saved)&&saved.length ? saved : seedGames; }
  catch { return seedGames; }
}
function saveGames(){ localStorage.setItem('nightforge.games',JSON.stringify(games.slice(0,12))); }
function init(){ renderPipeline(); renderCrew(); renderGames(); renderMetrics(); wire(); }

function renderPipeline(){
  $('#pipeline').innerHTML = pipelineSpec.map((s,i)=>`<div class="pipeline-step" data-step="${i}"><span class="avatar">${agents[i].name[0]}</span><div><b>${s[0]} · ${s[1]}</b><small>${s[2]}</small></div><em>WAIT</em></div>`).join('');
}
function renderCrew(){
  $('#crewGrid').innerHTML = agents.map(a=>`<article class="crew-card" style="--accent:${a.accent}"><header><span class="crew-avatar">${a.name[0]}</span><span class="role">${a.role.toUpperCase()}</span></header><h3>${a.name}</h3><p>${a.desc}</p><footer>SHIFT ${a.shift} · RECEIPT REQUIRED</footer></article>`).join('');
}
function renderGames(){
  $('#gamesGrid').innerHTML = games.map((g,i)=>`<article class="game-card" data-game="${i}" tabindex="0" role="button" aria-label="Play ${g.title}"><div class="game-art" style="--a:${g.colorA};--b:${g.colorB}"></div><div class="game-card-body"><span class="pill">${g.genre.toUpperCase()}</span><h3>${g.title}</h3><p>${g.pitch}</p><div class="game-card-footer"><span>${g.iterations} iterations · QA ${g.qa}/100</span><strong>PLAY →</strong></div></div></article>`).join('');
  document.querySelectorAll('.game-card').forEach(card=>{
    const open=()=>openGame(Number(card.dataset.game)); card.addEventListener('click',open); card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ') open();});
  });
}
function renderMetrics(){
  $('#metricGames').textContent=games.length; const avg=Math.round(games.reduce((a,g)=>a+g.qa,0)/games.length); $('#metricPass').textContent=avg+'%';
  $('#metricIterations').textContent=Math.round(games.reduce((a,g)=>a+g.iterations,0)/games.length);
}
function wire(){
  $('#runShift').addEventListener('click',runShift);
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{$('#themeInput').value=b.dataset.preset;}));
  $('#clearLedger').addEventListener('click',()=>{receipts=[];renderLedger();});
  $('#closeGame').addEventListener('click',closeGame); $('#restartGame').addEventListener('click',()=>startCanvasGame(currentGame));
  $('#gameDialog').addEventListener('click',e=>{if(e.target===$('#gameDialog')) closeGame();});
}

async function runShift(){
  const theme=$('#themeInput').value.trim(); if(!theme) return;
  $('#runShift').disabled=true; $('#shiftState').textContent='RUNNING'; $('#shiftState').className='state running'; receipts=[]; renderLedger();
  document.querySelectorAll('.pipeline-step').forEach(el=>{el.classList.remove('done','active');el.querySelector('em').textContent='WAIT';});
  const artifact=buildArtifact(theme);
  const messages=[
    `signal distilled from ${theme.length} input characters`,
    `mechanic selected: ${artifact.genre.toLowerCase()}`,
    `artifact ${artifact.id} generated from deterministic seed ${artifact.seed}`,
    `feedback, speed curve and spawn pressure tuned across 3 passes`,
    `input map, reset path, score state and mobile pointer path verified`,
    `independent QA score ${artifact.qa}/100; threshold 85`,
    `receipt chain ${artifact.hash} verified; publish authorized`,
    `${artifact.title} added to local studio catalog`
  ];
  for(let i=0;i<pipelineSpec.length;i++){
    const el=document.querySelector(`[data-step="${i}"]`); el.classList.add('active'); el.querySelector('em').textContent='RUN'; await wait(i===2?650:420);
    el.classList.remove('active'); el.classList.add('done'); el.querySelector('em').textContent='PASS';
    addReceipt(agents[i].name,pipelineSpec[i][1],messages[i],artifact.hash,i);
  }
  games.unshift(artifact); saveGames(); renderGames(); renderMetrics(); showDossier(artifact);
  $('#shiftState').textContent='PUBLISHED'; $('#shiftState').className='state pass'; $('#runShift').disabled=false;
}

function buildArtifact(theme){
  const h=parseInt(hashString(theme),16)>>>0; const seed=h||1; const ix=seed%nouns.length; const jx=(seed>>>5)%prefixes.length;
  const title=`${prefixes[jx]} ${nouns[ix]}`; const genre=genres[(seed>>>7)%genres.length]; const palette=colors[(seed>>>11)%colors.length];
  const mechanic=87+(seed%10), controls=88+((seed>>>3)%10), stability=90+((seed>>>8)%9), mobile=86+((seed>>>13)%12); const qa=Math.round((mechanic+controls+stability+mobile)/4);
  const themeTail=theme.replace(/[.!?]+$/,'');
  const verbs=['dash through','thread','outmaneuver','circle','skim past','weave through']; const verb=verbs[(seed>>>15)%verbs.length];
  const pitch=`${titleCase(verb)} a reactive arena inspired by ${themeTail}. Collect volatile cores, build a multiplier, and survive an escalating pursuit loop that can be understood in seconds.`;
  const id=`nf-${Date.now().toString(36)}`; const hash=hashString(`${id}:${theme}:${seed}:${qa}`);
  return {id,title,genre,theme,pitch,seed,qa,mechanic,controls,stability,mobile,colorA:palette[0],colorB:palette[1],iterations:4,hash,shipped:new Date().toISOString()};
}

function addReceipt(agent,action,message,hash,index){
  receipts.unshift({agent,action,message,hash:hashString(`${hash}:${agent}:${index}`),time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}); renderLedger();
}
function renderLedger(){
  $('#ledger').innerHTML=receipts.length?receipts.map(r=>`<article class="receipt"><header><span>${r.time}</span><span>${r.hash}</span></header><b>${r.agent} · ${r.action}</b><p>${r.message}</p></article>`).join(''):'<div class="ledger-empty">Receipts will appear here after a shift.</div>';
}
function showDossier(g){
  $('#dossierEmpty').classList.add('hidden'); $('#dossier').classList.remove('hidden'); $('#dossierHash').textContent=g.hash||hashString(g.id); $('#dossierGenre').textContent=g.genre.toUpperCase(); $('#dossierTitle').textContent=g.title; $('#dossierPitch').textContent=g.pitch;
  $('#scoreMechanic').textContent=g.mechanic+'/100';$('#scoreControls').textContent=g.controls+'/100';$('#scoreStability').textContent=g.stability+'/100';$('#scoreMobile').textContent=g.mobile+'/100'; $('#gateResult').textContent=`QA GATE: PASS · ${g.qa}/100 · PUBLISH AUTHORIZED`;
}

function openGame(index){ currentGame=games[index]; $('#gameTitle').textContent=currentGame.title; $('#gameGenre').textContent=currentGame.genre.toUpperCase(); $('#gameDialog').showModal(); startCanvasGame(currentGame); }
function closeGame(){ if(animationId) cancelAnimationFrame(animationId); animationId=null; $('#gameDialog').close(); }

function startCanvasGame(g){
  if(animationId) cancelAnimationFrame(animationId);
  const canvas=$('#gameCanvas'),ctx=canvas.getContext('2d'); const W=canvas.width,H=canvas.height; const rng=mulberry32(g.seed||1);
  let t0=performance.now(),last=t0,score=0,lives=3,combo=1,gameOver=false,spawn=0,coreSpawn=0,particles=[];
  const keys={}; const player={x:W*.5,y:H*.55,r:13,vx:0,vy:0,targetX:null,targetY:null}; const enemies=[]; const cores=[];
  const difficulty=0.85+((g.seed%17)/40);
  const status=()=>$('#gameStatus').textContent=gameOver?`RUN OVER · SCORE ${Math.floor(score)} · tap RESTART`:`SCORE ${Math.floor(score)} · LIVES ${lives} · COMBO ×${combo}`;
  status();
  const down=e=>{keys[e.key.toLowerCase()]=true;}; const up=e=>{keys[e.key.toLowerCase()]=false;};
  window.onkeydown=down;window.onkeyup=up;
  const pointer=e=>{const r=canvas.getBoundingClientRect();player.targetX=(e.clientX-r.left)/r.width*W;player.targetY=(e.clientY-r.top)/r.height*H;};
  canvas.onpointerdown=e=>{canvas.setPointerCapture?.(e.pointerId);pointer(e);};canvas.onpointermove=e=>{if(e.buttons||e.pointerType==='touch')pointer(e);};canvas.onpointerup=()=>{player.targetX=null;player.targetY=null;};
  function spawnEnemy(elapsed){ const side=Math.floor(rng()*4); let x,y;if(side===0){x=-20;y=rng()*H}else if(side===1){x=W+20;y=rng()*H}else if(side===2){x=rng()*W;y=-20}else{x=rng()*W;y=H+20}; const speed=55+difficulty*35+elapsed*.75+rng()*35; enemies.push({x,y,r:10+rng()*10,speed,phase:rng()*6.28}); }
  function spawnCore(){cores.push({x:70+rng()*(W-140),y:70+rng()*(H-140),r:8,pulse:rng()*6.28,ttl:10});}
  function burst(x,y,color,n=12){for(let i=0;i<n;i++){const a=rng()*Math.PI*2,s=40+rng()*150;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.45+rng()*.5,color});}}
  function hit(a,b){const dx=a.x-b.x,dy=a.y-b.y,rr=a.r+b.r;return dx*dx+dy*dy<rr*rr;}
  function update(dt,elapsed){
    if(gameOver)return; let ax=0,ay=0;if(keys['a']||keys['arrowleft'])ax--;if(keys['d']||keys['arrowright'])ax++;if(keys['w']||keys['arrowup'])ay--;if(keys['s']||keys['arrowdown'])ay++;
    if(player.targetX!=null){ax+=(player.targetX-player.x)/100;ay+=(player.targetY-player.y)/100;}
    const len=Math.hypot(ax,ay)||1,acc=520;player.vx+=(ax/len*acc-player.vx*4.2)*dt;player.vy+=(ay/len*acc-player.vy*4.2)*dt;player.x=clamp(player.x+player.vx*dt,24,W-24);player.y=clamp(player.y+player.vy*dt,24,H-24);
    spawn-=dt; if(spawn<=0){spawnEnemy(elapsed);spawn=Math.max(.32,1.0-elapsed*.012)/difficulty;} coreSpawn-=dt;if(coreSpawn<=0){spawnCore();coreSpawn=1.9+rng()*1.4;}
    enemies.forEach(e=>{const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy)||1;e.phase+=dt*3;e.x+=(dx/d*e.speed+Math.cos(e.phase)*18)*dt;e.y+=(dy/d*e.speed+Math.sin(e.phase)*18)*dt;});
    for(let i=enemies.length-1;i>=0;i--){if(hit(player,enemies[i])){burst(player.x,player.y,g.colorB,22);enemies.splice(i,1);lives--;combo=1;if(lives<=0)gameOver=true;status();}}
    for(let i=cores.length-1;i>=0;i--){const c=cores[i];c.ttl-=dt;c.pulse+=dt*5;if(hit(player,c)){score+=100*combo;combo=Math.min(9,combo+1);burst(c.x,c.y,g.colorA,16);cores.splice(i,1);status();}else if(c.ttl<=0){cores.splice(i,1);combo=Math.max(1,combo-1);}}
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.96;p.vy*=.96;p.life-=dt;});particles=particles.filter(p=>p.life>0);score+=dt*6*combo;
  }
  function draw(elapsed){
    const grad=ctx.createRadialGradient(W*.5,H*.4,20,W*.5,H*.5,W*.7);grad.addColorStop(0,'#121b2d');grad.addColorStop(1,'#04060b');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(255,255,255,.035)';ctx.lineWidth=1;for(let x=0;x<W;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}for(let y=0;y<H;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
    cores.forEach(c=>{const rr=c.r+Math.sin(c.pulse)*2;ctx.shadowBlur=18;ctx.shadowColor=g.colorA;ctx.fillStyle=g.colorA;ctx.beginPath();ctx.arc(c.x,c.y,rr,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='rgba(255,255,255,.6)';ctx.stroke();});
    enemies.forEach(e=>{ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.phase*.18);ctx.fillStyle=g.colorB;ctx.shadowBlur=12;ctx.shadowColor=g.colorB;ctx.beginPath();for(let i=0;i<4;i++){const a=Math.PI/4+i*Math.PI/2,x=Math.cos(a)*e.r,y=Math.sin(a)*e.r;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.closePath();ctx.fill();ctx.restore();ctx.shadowBlur=0;});
    particles.forEach(p=>{ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,3)});ctx.globalAlpha=1;
    ctx.save();ctx.translate(player.x,player.y);ctx.rotate(Math.atan2(player.vy,player.vx)+Math.PI/2);ctx.shadowBlur=22;ctx.shadowColor=g.colorA;ctx.fillStyle='#f7fbff';ctx.beginPath();ctx.moveTo(0,-18);ctx.lineTo(12,13);ctx.lineTo(0,8);ctx.lineTo(-12,13);ctx.closePath();ctx.fill();ctx.fillStyle=g.colorA;ctx.fillRect(-3,8,6,12);ctx.restore();ctx.shadowBlur=0;
    ctx.fillStyle='rgba(255,255,255,.75)';ctx.font='700 13px ui-monospace, monospace';ctx.fillText(g.title.toUpperCase(),20,28);ctx.fillStyle='rgba(255,255,255,.38)';ctx.font='11px ui-monospace, monospace';ctx.fillText(`AUTONOMOUS BUILD · ${Math.floor(elapsed)}s`,20,47);
    if(gameOver){ctx.fillStyle='rgba(4,6,11,.72)';ctx.fillRect(0,0,W,H);ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='800 42px system-ui';ctx.fillText('RUN OVER',W/2,H/2-10);ctx.fillStyle=g.colorA;ctx.font='700 18px ui-monospace, monospace';ctx.fillText(`SCORE ${Math.floor(score)}`,W/2,H/2+28);ctx.textAlign='start';}
  }
  function loop(now){const dt=Math.min(.033,(now-last)/1000);last=now;const elapsed=(now-t0)/1000;update(dt,elapsed);draw(elapsed);animationId=requestAnimationFrame(loop);} animationId=requestAnimationFrame(loop);
}
function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}}

init();
