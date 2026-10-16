import { sampleCartesian, sampleParametric, valueToFrequency, clamp, encodeState, decodeState } from './engine.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('graph');
const ctx2d = canvas.getContext('2d');
const duration = 6;

const presets = [
  { name:'Frequency', note:'hear cycles accelerate', mode:'cartesian', formula:'a*sin(b*x)', a:1, b:1, c:0, lesson:'Drag b: more cycles become a higher, faster-changing pitch.' },
  { name:'Amplitude', note:'height becomes pitch range', mode:'cartesian', formula:'a*sin(x)+c', a:1.5, b:1, c:0, lesson:'Drag a: taller waves create a wider pitch sweep.' },
  { name:'Chirp', note:'frequency changes over x', mode:'cartesian', formula:'sin(x*(1+a*0.15*x))', a:1.2, b:1, c:0, lesson:'A chirp compresses its waves over time, so the sound accelerates.' },
  { name:'Beating', note:'two nearby frequencies', mode:'cartesian', formula:'sin(x)+sin(a*x)', a:1.18, b:1, c:0, lesson:'Nearby frequencies reinforce and cancel, creating audible beats.' },
  { name:'Wave packet', note:'oscillation inside an envelope', mode:'cartesian', formula:'a*sin(b*x)*exp(-0.08*x^2)', a:2, b:3, c:0, lesson:'The exponential envelope contains a faster oscillation.' },
  { name:'Orbit', note:'parametric circle', mode:'parametric', xFormula:'a*cos(t)', yFormula:'a*sin(t)', a:2.4, b:1, c:0, lesson:'Parametric equations let x and y move together around a path.' }
];

let state = { mode:'cartesian', formula:'a*sin(b*x)+c', xFormula:'a*cos(t)', yFormula:'a*sin(t)', a:1, b:1, c:0 };
let points = [];
let playing = false;
let startedAt = 0;
let progress = 0;
let raf = 0;
let audio = null;
let recorder = null;
let recordedChunks = [];
let recording = false;

function setError(message='') { $('error').textContent = message; }
function syncControls() {
  $('formula').value = state.formula;
  $('xFormula').value = state.xFormula;
  $('yFormula').value = state.yFormula;
  for (const key of ['a','b','c']) {
    $(`${key}Slider`).value = state[key];
    $(`${key}Out`).value = Number(state[key]).toFixed(1);
  }
  document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('active', el.dataset.mode === state.mode));
  $('cartesianEditor').hidden = state.mode !== 'cartesian';
  $('parametricEditor').hidden = state.mode !== 'parametric';
}

function rebuild() {
  try {
    points = state.mode === 'cartesian'
      ? sampleCartesian(state.formula, state, [-8, 8], 900)
      : sampleParametric(state.xFormula, state.yFormula, state, [0, Math.PI * 2], 900);
    if (!points.some((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) throw new Error('Formula produced no finite points.');
    setError();
    draw(progress);
    return true;
  } catch (error) {
    setError(error.message || 'Could not draw this formula.');
    return false;
  }
}

function colors() {
  const light = document.documentElement.classList.contains('light');
  return light ? { grid:'#dfddd5', axis:'#aaa69a', curve:'#1b1b1b', trace:'#1f806d', dot:'#e7583e' }
               : { grid:'#222631', axis:'#545a69', curve:'#e8eaf1', trace:'#9ef0d0', dot:'#f6e96f' };
}
function mapX(x) { return ((x + 8) / 16) * canvas.width; }
function mapY(y) { return ((5 - y) / 10) * canvas.height; }

function draw(p = 0) {
  const c = colors();
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  ctx2d.lineWidth = 1;
  ctx2d.strokeStyle = c.grid;
  for (let x=-8; x<=8; x+=1) { ctx2d.beginPath(); ctx2d.moveTo(mapX(x),0); ctx2d.lineTo(mapX(x),canvas.height); ctx2d.stroke(); }
  for (let y=-5; y<=5; y+=1) { ctx2d.beginPath(); ctx2d.moveTo(0,mapY(y)); ctx2d.lineTo(canvas.width,mapY(y)); ctx2d.stroke(); }
  ctx2d.strokeStyle = c.axis; ctx2d.lineWidth = 2;
  ctx2d.beginPath(); ctx2d.moveTo(mapX(0),0); ctx2d.lineTo(mapX(0),canvas.height); ctx2d.moveTo(0,mapY(0)); ctx2d.lineTo(canvas.width,mapY(0)); ctx2d.stroke();

  const drawPath = (limit, stroke, width) => {
    ctx2d.strokeStyle = stroke; ctx2d.lineWidth = width; ctx2d.beginPath(); let open=false;
    for (let i=0; i<limit; i+=1) {
      const point=points[i]; if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.y)>40) { open=false; continue; }
      const px=mapX(point.x), py=mapY(point.y); if (!open) { ctx2d.moveTo(px,py); open=true; } else ctx2d.lineTo(px,py);
    }
    ctx2d.stroke();
  };
  drawPath(points.length, c.curve, 2);
  const count = Math.max(1, Math.floor(points.length * clamp(p,0,1)));
  if (p > 0) drawPath(count, c.trace, 5);
  const point = points[Math.min(points.length-1, Math.max(0,count-1))];
  if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
    ctx2d.fillStyle=c.dot; ctx2d.beginPath(); ctx2d.arc(mapX(point.x),mapY(point.y),8,0,Math.PI*2); ctx2d.fill();
    const hz=valueToFrequency(point.y); $('coordReadout').textContent=`x ${point.x.toFixed(2)} · y ${point.y.toFixed(2)}`; $('hzReadout').textContent=`${Math.round(hz)} Hz`;
    updateAudio(point, hz);
  }
}

async function ensureAudio() {
  if (audio) { if (audio.context.state === 'suspended') await audio.context.resume(); return audio; }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('Web Audio is not supported in this browser.');
  const context = new AudioCtx();
  const osc=context.createOscillator(), gain=context.createGain(), delay=context.createDelay(1), echoGain=context.createGain(), pan=context.createStereoPanner(), recordDest=context.createMediaStreamDestination();
  osc.type=$('voice').value; gain.gain.value=0; delay.delayTime.value=.2; echoGain.gain.value=Number($('echo').value);
  osc.connect(gain); gain.connect(pan); pan.connect(context.destination); pan.connect(recordDest); gain.connect(delay); delay.connect(echoGain); echoGain.connect(pan); osc.start();
  audio={context,osc,gain,delay,echoGain,pan,recordDest}; return audio;
}
function updateAudio(point, hz) {
  if (!audio) return;
  const now=audio.context.currentTime, mapping=$('mapping').value;
  audio.osc.type=$('voice').value;
  if (mapping !== 'pan') audio.osc.frequency.setTargetAtTime(hz,now,.018); else audio.osc.frequency.setTargetAtTime(220,now,.018);
  audio.pan.pan.setTargetAtTime(mapping === 'pitch' ? 0 : clamp(point.x/8,-1,1),now,.03);
  audio.echoGain.gain.setTargetAtTime(Number($('echo').value),now,.04);
}
function setAudioGate(on) { if (audio) audio.gain.gain.setTargetAtTime(on ? Number($('volume').value) : 0,audio.context.currentTime,.025); }

async function play(fromStart=false) {
  if (!rebuild()) return;
  try { await ensureAudio(); } catch (e) { setError(e.message); return; }
  if (fromStart) progress=0;
  if (playing) { playing=false; cancelAnimationFrame(raf); setAudioGate(false); $('playBtn').textContent='▶ Play'; return; }
  playing=true; $('playBtn').textContent='Ⅱ Pause'; setAudioGate(true); startedAt=performance.now()-(progress*duration*1000);
  const tick=(now)=>{
    if (!playing) return;
    progress=clamp((now-startedAt)/(duration*1000),0,1); $('timeline').value=Math.round(progress*1000); $('timeReadout').textContent=`00:${String(Math.floor(progress*duration)).padStart(2,'0')} / 00:06`; draw(progress);
    if (progress>=1) { playing=false; setAudioGate(false); $('playBtn').textContent='▶ Play'; if (recording && recorder?.state==='recording') recorder.stop(); return; }
    raf=requestAnimationFrame(tick);
  }; raf=requestAnimationFrame(tick);
}

function snapshot() { return { mode:state.mode, formula:state.formula, xFormula:state.xFormula, yFormula:state.yFormula, a:state.a, b:state.b, c:state.c }; }
function applySnapshot(next) {
  state={...state,...next}; syncControls(); progress=0; $('timeline').value=0; rebuild();
}
function renderSaved() {
  const items=JSON.parse(localStorage.getItem('sonic-math-lab:saves')||'[]'); const root=$('savedList'); root.innerHTML='';
  if (!items.length) { root.innerHTML='<p class="muted">Nothing saved yet.</p>'; return; }
  items.slice().reverse().forEach((item,index)=>{ const row=document.createElement('div'); row.className='saved-item'; const label=document.createElement('span'); label.textContent=item.name; const load=document.createElement('button'); load.textContent='Load'; load.onclick=()=>applySnapshot(item.state); row.append(label,load); root.append(row); });
}

for (const preset of presets) {
  const button=document.createElement('button'); button.className='preset'; button.type='button'; button.innerHTML=`<strong>${preset.name}</strong><span>${preset.note}</span>`; button.onclick=()=>{ applySnapshot(preset); $('lessonTag').textContent=preset.name; $('lessonText').textContent=preset.lesson; }; $('presetGrid').append(button);
}

document.querySelectorAll('.tab').forEach((tab)=>tab.addEventListener('click',()=>{ state.mode=tab.dataset.mode; syncControls(); rebuild(); }));
$('applyBtn').onclick=()=>{ state.formula=$('formula').value; progress=0; rebuild(); };
$('paramApplyBtn').onclick=()=>{ state.xFormula=$('xFormula').value; state.yFormula=$('yFormula').value; progress=0; rebuild(); };
for (const key of ['a','b','c']) $(''+key+'Slider').addEventListener('input',(e)=>{ state[key]=Number(e.target.value); $(`${key}Out`).value=state[key].toFixed(1); rebuild(); });
$('volume').addEventListener('input',(e)=>{ $('volumeOut').value=`${Math.round(Number(e.target.value)*100)}%`; if (playing) setAudioGate(true); });
$('echo').addEventListener('input',(e)=>{ $('echoOut').value=`${Math.round(Number(e.target.value)*100)}%`; if(audio) audio.echoGain.gain.value=Number(e.target.value); });
$('voice').addEventListener('change',()=>{ if(audio) audio.osc.type=$('voice').value; });
$('playBtn').onclick=()=>play(false);
$('timeline').addEventListener('input',(e)=>{ progress=Number(e.target.value)/1000; if(playing) startedAt=performance.now()-(progress*duration*1000); draw(progress); });
$('themeBtn').onclick=()=>{ document.documentElement.classList.toggle('light'); localStorage.setItem('sonic-math-lab:theme',document.documentElement.classList.contains('light')?'light':'dark'); draw(progress); };
$('saveBtn').onclick=()=>{ const items=JSON.parse(localStorage.getItem('sonic-math-lab:saves')||'[]'); items.push({name:`Creation ${items.length+1}`,state:snapshot()}); localStorage.setItem('sonic-math-lab:saves',JSON.stringify(items.slice(-12))); renderSaved(); };
$('shareBtn').onclick=async()=>{ const url=new URL(location.href); url.searchParams.set('s',encodeState(snapshot())); try{ await navigator.clipboard.writeText(url.toString()); $('shareBtn').textContent='Copied'; setTimeout(()=>$('shareBtn').textContent='Copy share link',1200); }catch{ prompt('Copy this link',url.toString()); } };

$('recordBtn').onclick=async()=>{
  if (recording) { recorder?.stop(); return; }
  if (!window.MediaRecorder || !canvas.captureStream) { setError('Video export is not supported in this browser.'); return; }
  try { await ensureAudio(); } catch(e) { setError(e.message); return; }
  const stream=canvas.captureStream(60); const audioTrack=audio.recordDest.stream.getAudioTracks()[0]; if(audioTrack) stream.addTrack(audioTrack);
  const preferred=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find((t)=>MediaRecorder.isTypeSupported(t));
  recorder=new MediaRecorder(stream,preferred?{mimeType:preferred}:undefined); recordedChunks=[]; recording=true; $('recordBtn').textContent='Stop export';
  recorder.ondataavailable=(e)=>{ if(e.data.size) recordedChunks.push(e.data); };
  recorder.onstop=()=>{ recording=false; $('recordBtn').textContent='Export video'; const blob=new Blob(recordedChunks,{type:recorder.mimeType||'video/webm'}); const href=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=href; a.download=`sonic-math-${Date.now()}.webm`; a.click(); setTimeout(()=>URL.revokeObjectURL(href),2000); };
  recorder.start(250); await play(true);
};

if(localStorage.getItem('sonic-math-lab:theme')==='light') document.documentElement.classList.add('light');
const encoded=new URL(location.href).searchParams.get('s'); if(encoded){ try{ applySnapshot(decodeState(encoded)); }catch{ setError('Shared state could not be loaded.'); } }
syncControls(); rebuild(); renderSaved();
