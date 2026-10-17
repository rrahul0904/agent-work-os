import { normalizeTranscript, extractMemories, nextAction, generateDrafts, buildICS } from './engine.mjs';

const STORAGE_KEY = 'dating-copilot-lab.v1';
const seed = {
  entered: false,
  selected: 'emma',
  profile: { tone: 'warm', casing: 'standard', emoji: 'rare', length: 'short' },
  threads: [
    { id: 'emma', name: 'Emma', platform: 'Tinder', hours: 2, transcript: 'You: How is training going?\nThem: Pretty good! I am training for a half marathon and I love tiny coffee shops. I am free Thursday after 7, what about you?' },
    { id: 'lucy', name: 'Lucy', platform: 'Hinge', hours: 28, transcript: 'You: You had me at strong coffee opinions.\nThem: I love trying new coffee spots. What is your go-to?' },
    { id: 'maya', name: 'Maya', platform: 'iMessage', hours: 1, transcript: 'Them: Live music is my weakness.\nYou: Same. I know a small place with a great jazz night.' },
  ]
};

let state = load();
function load(){ try { return {...structuredClone(seed), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')} } catch { return structuredClone(seed) } }
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
const $ = (id) => document.getElementById(id);
function active(){ return state.threads.find(t=>t.id===state.selected) || state.threads[0] }
function escapeHtml(s=''){ return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])) }

function renderThreads(){
  $('threadList').innerHTML = state.threads.map(t => {
    const action = nextAction(normalizeTranscript(t.transcript), { lastActivityHours:t.hours });
    return `<button class="thread ${t.id===state.selected?'active':''}" data-id="${t.id}"><span class="thread-top"><span>${escapeHtml(t.name)}</span><span class="badge">${escapeHtml(t.platform)}</span></span><small>${escapeHtml(action.label)} · ${t.hours < 24 ? `${t.hours}h` : `${Math.round(t.hours/24)}d`} ago</small></button>`;
  }).join('');
  document.querySelectorAll('.thread').forEach(b=>b.addEventListener('click',()=>{ state.selected=b.dataset.id; save(); render(); }));
}

function renderDrafts(result){
  if(result.blocked){
    $('draftList').innerHTML='<div class="empty">Drafting disabled for this conversation.</div>';
    $('safetyNotice').textContent=result.reason;
    $('safetyNotice').classList.remove('hidden');
    return;
  }
  $('safetyNotice').classList.add('hidden');
  $('draftList').innerHTML=result.drafts.length ? result.drafts.map((d,i)=>`<article class="draft"><span class="draft-score">OPTION ${i+1} · ${(d.score*100).toFixed(0)}%</span><p>${escapeHtml(d.text)}</p><small>${escapeHtml(d.why)}</small><button class="secondary copy" data-text="${escapeHtml(d.text)}">Copy draft</button></article>`).join('') : '<div class="empty">Add a message from the other person to generate drafts.</div>';
  document.querySelectorAll('.copy').forEach(b=>b.addEventListener('click',async()=>{ await navigator.clipboard?.writeText(b.dataset.text); b.textContent='Copied — edit before sending'; setTimeout(()=>b.textContent='Copy draft',1800); }));
}

function render(){
  $('ageGate').classList.toggle('hidden', state.entered);
  $('app').classList.toggle('hidden', !state.entered);
  if(!state.entered) return;
  renderThreads();
  const t=active(); if(!t) return;
  $('matchTitle').textContent=t.name;
  $('transcript').value=t.transcript;
  Object.entries(state.profile).forEach(([k,v])=>{ if($(k)) $(k).value=v; });
  const messages=normalizeTranscript(t.transcript), memories=extractMemories(messages), action=nextAction(messages,{lastActivityHours:t.hours});
  $('nextActionLabel').textContent=action.label;
  $('nextActionText').textContent=action.rationale;
  $('statusPill').textContent=action.kind==='wait'?'Waiting':action.kind==='stop'?'Boundary':'Your turn';
  $('memoryList').innerHTML=memories.length ? memories.map(m=>`<span class="memory">${escapeHtml(m)}</span>`).join('') : '<span class="empty">No stable details extracted yet.</span>';
  renderDrafts(generateDrafts(messages,state.profile,memories));
}

$('enterButton').addEventListener('click',()=>{ state.entered=true; save(); render(); });
$('privacyButton').addEventListener('click',()=>$('privacyDialog').showModal());
$('newMatch').addEventListener('click',()=>$('newDialog').showModal());
$('newForm').addEventListener('submit',(e)=>{ e.preventDefault(); const name=$('newName').value.trim(); if(!name)return; const id=`t-${Date.now()}`; state.threads.unshift({id,name,platform:$('newPlatform').value,hours:0,transcript:''}); state.selected=id; save(); $('newDialog').close(); $('newForm').reset(); render(); });
$('transcript').addEventListener('input',(e)=>{ active().transcript=e.target.value; active().hours=0; save(); renderThreads(); const msgs=normalizeTranscript(active().transcript); $('memoryList').innerHTML=extractMemories(msgs).map(m=>`<span class="memory">${escapeHtml(m)}</span>`).join('')||'<span class="empty">No stable details extracted yet.</span>'; });
for(const id of ['tone','casing','emoji','length']) $(id).addEventListener('change',(e)=>{ state.profile[id]=e.target.value; save(); });
$('draftButton').addEventListener('click',()=>{ const t=active(), msgs=normalizeTranscript(t.transcript), memories=extractMemories(msgs), action=nextAction(msgs,{lastActivityHours:t.hours}); $('nextActionLabel').textContent=action.label; $('nextActionText').textContent=action.rationale; renderDrafts(generateDrafts(msgs,state.profile,memories)); });
$('deleteAll').addEventListener('click',()=>{ localStorage.removeItem(STORAGE_KEY); state=structuredClone(seed); $('privacyDialog').close(); render(); });
$('calendarButton').addEventListener('click',()=>{ const t=active(), local=$('dateTime').value; if(!local){ $('dateTime').focus(); return; } const start=new Date(local); const ics=buildICS({title:`Date with ${t.name}`,start:start.toISOString(),location:$('location').value,description:`Draft plan: ${$('venue').value}. Confirm the time and place with ${t.name} before treating this as final.`}); const blob=new Blob([ics],{type:'text/calendar'}), a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`date-with-${t.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.ics`; a.click(); URL.revokeObjectURL(a.href); });

const dt = new Date(Date.now()+2*86400000); dt.setHours(19,30,0,0); $('dateTime').value = new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,16);
render();
