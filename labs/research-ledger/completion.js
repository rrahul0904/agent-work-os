import { validateNotebook, replaceNotebookStores, MAX_IMPORT_BYTES } from './notebook-contract.js';
const DB_NAME='research-ledger';
const DB_VERSION=3;
const SNAPSHOT_STORE='snapshots';
const CAPTURE_STORE='captures';
const CONTRACT_VERSION='research-ledger/notebook.v1';
let restoring=false;

function completionOpenDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('documents')) db.createObjectStore('documents',{keyPath:'id'});
      if(!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE,{keyPath:'id'});
      if(!db.objectStoreNames.contains(CAPTURE_STORE)) db.createObjectStore(CAPTURE_STORE,{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function storePut(store,value){const db=await completionOpenDb();await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();}
async function storeAll(store){const db=await completionOpenDb();const values=await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly');const req=tx.objectStore(store).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)});db.close();return values;}
async function storeClear(store){const db=await completionOpenDb();await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();}
async function storeDelete(store,id){const db=await completionOpenDb();await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();}
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
const completionUid=(p='snap')=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
async function sha256(text){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(text)));return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('');}

function injectCompletionUi(){
  const studio=document.querySelector('#studio');
  if(!studio||document.querySelector('#historyCard'))return;
  const section=document.createElement('section');
  section.className='card completion-card';
  section.id='historyCard';
  section.innerHTML=`<div class="section-head"><div><span class="eyebrow">VERSION GRAPH + REPLAY</span><h2>Keep every research state inspectable</h2><p>Snapshots bind the question, brief and evidence hash. Compare versions, replay an older conclusion, import/export a portable notebook contract, and recheck captured URLs.</p></div><div class="doc-actions"><button id="saveSnapshot">Save snapshot</button><button id="importNotebook">Import notebook</button><button id="exportContract" class="primary">Export contract</button><input id="importNotebookFile" type="file" accept="application/json,.json" hidden></div></div><div class="completion-grid"><div><div class="rail-title"><span>Snapshot history</span><b id="snapshotCount">0</b></div><div id="snapshotList" class="snapshot-list"><div class="empty-state small">No durable snapshots yet.</div></div></div><div><div class="rail-title"><span>Replay / diff</span><em id="replayState">select a snapshot</em></div><div id="snapshotDiff" class="diff-panel"><div class="empty-state small">Compare an older snapshot with the current brief.</div></div></div><div><div class="rail-title"><span>Remote freshness</span><em id="freshnessState">manual</em></div><p class="compact-copy">Only explicitly captured public HTTP(S) URLs are checked. Private/local destinations are refused server-side.</p><button id="checkRemoteFreshness">Check captured URLs</button><div id="freshnessResults" class="freshness-results"></div></div></div>`;
  studio.insertAdjacentElement('afterend',section);
  const p=document.createElement('div');p.id='pageProvenance';p.className='page-provenance';document.querySelector('#passageDialog pre')?.insertAdjacentElement('beforebegin',p);
}

function currentBrief(){try{return JSON.parse(localStorage.getItem('research-ledger:last-brief')||'null')}catch{return null}}
async function currentDocuments(){return storeAll('documents')}
async function evidenceFingerprint(){const docs=await currentDocuments();const captures=await storeAll(CAPTURE_STORE);return sha256(JSON.stringify({docs:docs.map(d=>({id:d.id,name:d.name,text:d.text})),captures:captures.map(c=>({id:c.id,title:c.title,url:c.url,text:c.text,kind:c.kind}))}));}
async function saveSnapshot(reason='manual'){
  const brief=currentBrief(); if(!brief)return null;
  const docs=await currentDocuments();const captures=await storeAll(CAPTURE_STORE);const evidenceHash=await evidenceFingerprint();
  const snapshot={id:completionUid('SNAP'),schema:'research-ledger/snapshot.v1',reason,createdAt:new Date().toISOString(),notebook:document.querySelector('#notebookName')?.value||'Untitled notebook',question:brief.question||document.querySelector('#question')?.value||'',brief,evidenceHash,documentRefs:docs.map(d=>({id:d.id,name:d.name,size:d.size,type:d.type,addedAt:d.addedAt})),captureRefs:captures.map(c=>({id:c.id,title:c.title,url:c.url,kind:c.kind,perspective:c.perspective}))};
  await storePut(SNAPSHOT_STORE,snapshot);
  const all=(await storeAll(SNAPSHOT_STORE)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  for(const old of all.slice(50))await storeDelete(SNAPSHOT_STORE,old.id);
  await renderSnapshots();return snapshot;
}
function claimMap(brief){return new Map((brief?.claims||[]).map(c=>[c.id,c]));}
function diffBriefs(oldB,newB){
  if(!oldB||!newB)return ['One side of the comparison has no brief.'];
  const out=[];
  if(oldB.status!==newB.status)out.push(`Status: ${oldB.status||'—'} → ${newB.status||'—'}`);
  if(oldB.overview!==newB.overview)out.push('Working conclusion changed.');
  const oldClaims=claimMap(oldB),newClaims=claimMap(newB);
  for(const [id,c] of oldClaims){if(!newClaims.has(id))out.push(`${id} removed: ${c.text}`);else if(newClaims.get(id).text!==c.text)out.push(`${id} changed.`)}
  for(const [id,c] of newClaims){if(!oldClaims.has(id))out.push(`${id} added: ${c.text}`)}
  const oldEv=new Set((oldB.sources||[]).map(s=>s.id)),newEv=new Set((newB.sources||[]).map(s=>s.id));
  const added=[...newEv].filter(x=>!oldEv.has(x)),removed=[...oldEv].filter(x=>!newEv.has(x));
  if(added.length)out.push(`Evidence added: ${added.join(', ')}`);if(removed.length)out.push(`Evidence removed: ${removed.join(', ')}`);
  return out.length?out:['No material brief-level differences detected.'];
}
async function renderSnapshots(){
  const list=(await storeAll(SNAPSHOT_STORE)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const count=document.querySelector('#snapshotCount');if(count)count.textContent=list.length;
  const root=document.querySelector('#snapshotList');if(!root)return;
  root.innerHTML=list.length?list.map(s=>`<article class="snapshot-item"><div><strong>${esc(s.brief?.title||s.question||'Research snapshot')}</strong><small>${new Date(s.createdAt).toLocaleString()} · ${esc(s.reason||'manual')} · ${esc(String(s.evidenceHash||'').slice(0,10))}</small></div><div class="snapshot-actions"><button data-diff-snapshot="${esc(s.id)}">Diff</button><button data-replay-snapshot="${esc(s.id)}">Replay</button></div></article>`).join(''):'<div class="empty-state small">No durable snapshots yet.</div>';
  root.querySelectorAll('[data-diff-snapshot]').forEach(btn=>btn.onclick=async()=>{const s=list.find(x=>x.id===btn.dataset.diffSnapshot);const diffs=diffBriefs(s?.brief,currentBrief());document.querySelector('#replayState').textContent=`${new Date(s.createdAt).toLocaleString()} vs current`;document.querySelector('#snapshotDiff').innerHTML=`<ul>${diffs.map(d=>`<li>${esc(d)}</li>`).join('')}</ul><p><strong>Evidence hash then:</strong> ${esc(s.evidenceHash||'')}</p>`;});
  root.querySelectorAll('[data-replay-snapshot]').forEach(btn=>btn.onclick=async()=>{const s=list.find(x=>x.id===btn.dataset.replaySnapshot);if(!s)return;localStorage.setItem('research-ledger:last-brief',JSON.stringify({...s.brief,replayedFrom:s.id,replayedAt:new Date().toISOString()}));localStorage.setItem('research-ledger:notebook-name',s.notebook||'Replayed notebook');location.reload();});
}

async function restoreCaptures(){
  const captures=await storeAll(CAPTURE_STORE);if(!captures.length)return;
  restoring=true;
  try{
    for(const c of captures){
      if([...document.querySelectorAll('#sourceTray .source-chip')].some(x=>x.textContent.includes(c.title||c.url||c.id)))continue;
      const title=document.querySelector('#sourceTitle'),url=document.querySelector('#sourceUrl'),text=document.querySelector('#sourceText'),button=document.querySelector('#confirmSource');
      if(!title||!url||!text||!button)break;
      document.querySelector('#addUrl')?.click();title.value=c.title||'';url.value=c.url||'';text.value=c.text||'';button.click();
    }
  } finally {restoring=false;document.querySelector('#sourceDialog')?.close?.();}
}
function installCapturePersistence(){
  document.addEventListener('click',async e=>{
    const target=e.target?.closest?.('#confirmSource');if(!target||restoring)return;
    const title=document.querySelector('#sourceTitle')?.value.trim()||'';const url=document.querySelector('#sourceUrl')?.value.trim()||'';const text=document.querySelector('#sourceText')?.value.trim()||'';if(!url&&!text)return;
    const kind=(document.querySelector('#dialogTitle')?.textContent||'').toLowerCase();
    const record={id:completionUid('CAP'),title:title||url||'Captured source',url,text,kind:kind.includes('ai chat')?'ai-context':kind.includes('rea')?'rea-evidence':'captured',perspective:kind.includes('ai chat')?'context-only':'user-selected',capturedAt:new Date().toISOString()};
    await storePut(CAPTURE_STORE,record);
  },true);
}

async function exportContract(){
  const docs=await currentDocuments(),captures=await storeAll(CAPTURE_STORE),snaps=await storeAll(SNAPSHOT_STORE);const brief=currentBrief();
  const payload={schema:CONTRACT_VERSION,exportedAt:new Date().toISOString(),notebook:{name:document.querySelector('#notebookName')?.value||'Untitled notebook'},documents:docs,captures,snapshots:snaps,activeBrief:brief,evidenceHash:await evidenceFingerprint()};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='research-ledger-notebook.v1.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function importContract(file){
  if (file.size > MAX_IMPORT_BYTES) throw new Error('Notebook exceeds 50 MB import limit');
  const parsed = JSON.parse(await file.text());
  const validated = validateNotebook(parsed); // no persistent state touched before full validation
  const db = await completionOpenDb();
  try { await replaceNotebookStores(db, validated); }
  finally { db.close(); }
  localStorage.setItem('research-ledger:notebook-name',validated.notebook.name||'Imported notebook');
  if(validated.activeBrief)localStorage.setItem('research-ledger:last-brief',JSON.stringify(validated.activeBrief));
  else localStorage.removeItem('research-ledger:last-brief');
  if(validated.evidenceHash)localStorage.setItem('research-ledger:evidence-hash',validated.evidenceHash);
  else localStorage.removeItem('research-ledger:evidence-hash');
  location.reload();
}

async function checkRemoteFreshness(){
  const captures=(await storeAll(CAPTURE_STORE)).filter(c=>/^https?:\/\//i.test(c.url||'')).slice(0,8);const root=document.querySelector('#freshnessResults');const state=document.querySelector('#freshnessState');
  if(!captures.length){root.innerHTML='<div class="empty-state small">No captured public URLs to check.</div>';return;}
  state.textContent='checking…';root.innerHTML='<div class="empty-state small">Checking bounded public URL metadata…</div>';
  try{
    const r=await fetch('/api/source-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({urls:captures.map(c=>c.url)})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Freshness check failed');
    const previous=JSON.parse(localStorage.getItem('research-ledger:remote-freshness')||'{}');let changed=0;
    root.innerHTML=(d.results||[]).map(x=>{const before=previous[x.url];const isChanged=!!before&&before.fingerprint&&x.fingerprint&&before.fingerprint!==x.fingerprint;if(isChanged)changed++;previous[x.url]=x;return `<div class="freshness-item"><strong>${esc(x.url)}</strong><span>${esc(x.ok?'reachable':'check failed')} · ${esc(x.status||'—')} ${isChanged?'· CHANGED':''}</span><small>${esc(x.lastModified||x.etag||x.error||'No validator headers')}</small></div>`}).join('');
    localStorage.setItem('research-ledger:remote-freshness',JSON.stringify(previous));state.textContent=changed?`${changed} changed`:'no detected change';
  }catch(error){root.innerHTML=`<div class="empty-state small">${esc(error.message)}</div>`;state.textContent='failed';}
}

function augmentPassageProvenance(){
  const pre=document.querySelector('#passageText'),badge=document.querySelector('#pageProvenance');if(!pre||!badge)return;
  const observer=new MutationObserver(()=>{const matches=[...pre.textContent.matchAll(/\[\[Page\s+(\d+)\]\]/gi)].map(m=>m[1]);badge.textContent=matches.length?`PDF page provenance: ${[...new Set(matches)].join(', ')}`:'Passage provenance: exact local chunk';});observer.observe(pre,{childList:true,characterData:true,subtree:true});
}
function installAutoSnapshot(){
  const title=document.querySelector('#briefTitle');if(!title)return;let last='';let timer;const observer=new MutationObserver(()=>{const key=localStorage.getItem('research-ledger:last-brief')||'';if(!key||key===last)return;last=key;clearTimeout(timer);timer=setTimeout(()=>saveSnapshot('research-run').catch(()=>{}),300);});observer.observe(title,{childList:true,subtree:true,characterData:true});
}

async function initCompletion(){
  injectCompletionUi();installCapturePersistence();augmentPassageProvenance();
  await new Promise(r=>setTimeout(r,80));await restoreCaptures();await renderSnapshots();installAutoSnapshot();
  document.querySelector('#saveSnapshot').onclick=()=>saveSnapshot('manual');
  document.querySelector('#exportContract').onclick=exportContract;
  document.querySelector('#importNotebook').onclick=()=>document.querySelector('#importNotebookFile').click();
  document.querySelector('#importNotebookFile').onchange=async e=>{try{if(e.target.files?.[0])await importContract(e.target.files[0]);}catch(error){alert(error.message)}finally{e.target.value=''}};
  document.querySelector('#checkRemoteFreshness').onclick=checkRemoteFreshness;
  const wipe=document.querySelector('#wipeData');wipe?.addEventListener('click',async()=>{if(!confirm('Also clear durable Research Ledger snapshots and captured-source persistence?'))return;await storeClear(SNAPSHOT_STORE);await storeClear(CAPTURE_STORE);});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initCompletion,{once:true});else initCompletion();
