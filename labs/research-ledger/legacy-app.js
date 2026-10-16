const state = {
  mode: 'answer',
  capturedSources: [],
  documents: [],
  chunks: [],
  brief: null,
  artifact: null,
  version: 1,
  provider: { live: false, model: 'local' },
  lastEvidenceHash: localStorage.getItem('research-ledger:evidence-hash') || '',
  currentEvidenceHash: ''
};
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const escapeHtml = (str) => String(str ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const STOP = new Set('a an the and or but if then than to of in on at by for from with without as is are was were be been being it its this that these those what which who whom how why when where can could should would may might will do does did have has had not no yes into about over under more most less least very also just their there they them we our you your i me my'.split(' '));

function uid(prefix='id'){ return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`; }
function tokenize(text){ return String(text||'').toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9À-ž]+/g,' ').split(/\s+/).filter(t=>t.length>1&&!STOP.has(t)); }
function truncate(text,n=280){ const s=String(text||'').replace(/\s+/g,' ').trim(); return s.length>n?s.slice(0,n-1)+'…':s; }
function formatBytes(n){ if(!Number.isFinite(n)||n<=0)return '0 B'; const u=['B','KB','MB','GB']; let i=0; while(n>=1024&&i<u.length-1){n/=1024;i++} return `${n.toFixed(i?1:0)} ${u[i]}`; }

function openDb(){ return new Promise((resolve,reject)=>{ const req=indexedDB.open('research-ledger',2); req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains('documents')) db.createObjectStore('documents',{keyPath:'id'}); }; req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); }
async function dbPut(doc){ const db=await openDb(); await new Promise((resolve,reject)=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put(doc);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)}); db.close(); }
async function dbDelete(id){ const db=await openDb(); await new Promise((resolve,reject)=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)}); db.close(); }
async function dbAll(){ const db=await openDb(); const docs=await new Promise((resolve,reject)=>{const tx=db.transaction('documents','readonly');const req=tx.objectStore('documents').getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)}); db.close(); return docs; }
async function dbClear(){ const db=await openDb(); await new Promise((resolve,reject)=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)}); db.close(); }

function chunkText(text, docId, title){
  const clean=String(text||'').replace(/\r/g,'').replace(/\n{3,}/g,'\n\n').trim();
  if(!clean) return [];
  const paragraphs=clean.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);
  const out=[]; let buffer=''; let ordinal=1;
  const push=()=>{ const value=buffer.trim(); if(value.length<30)return; out.push({id:`${docId}.C${ordinal++}`,docId,title,text:value,tokens:tokenize(value)}); buffer=''; };
  for(const p of paragraphs){
    if(p.length>1800){
      push();
      let start=0;
      while(start<p.length){ const end=Math.min(p.length,start+1500); const piece=p.slice(start,end); out.push({id:`${docId}.C${ordinal++}`,docId,title,text:piece,tokens:tokenize(piece)}); if(end===p.length)break; start=Math.max(start+1200,end-220); }
      continue;
    }
    if((buffer+'\n\n'+p).length>1500) push();
    buffer+=(buffer?'\n\n':'')+p;
  }
  push();
  return out;
}
function rebuildChunks(){ state.chunks=state.documents.flatMap(d=>chunkText(d.text,d.id,d.name)); state.capturedSources.forEach((s,i)=>{ if(s.text){ const id=s.id||`CAP${i+1}`; state.chunks.push(...chunkText(s.text,id,s.title||s.url||'Captured source')); }}); renderCapacity(); updateEvidenceHash(); }
function scoreChunk(chunk,query){ const q=tokenize(query); if(!q.length)return 0; const counts=new Map(); for(const t of chunk.tokens) counts.set(t,(counts.get(t)||0)+1); let score=0; for(const term of q){ const tf=counts.get(term)||0; if(tf) score+=1+Math.log1p(tf)*1.8; if(String(chunk.title).toLowerCase().includes(term))score+=.8; } const qPhrase=query.toLowerCase().trim(); if(qPhrase.length>5&&chunk.text.toLowerCase().includes(qPhrase))score+=6; return score/Math.sqrt(Math.max(chunk.tokens.length,30)); }
function retrieve(query,limit=7){ return state.chunks.map(c=>({...c,score:scoreChunk(c,query)})).filter(c=>c.score>0).sort((a,b)=>b.score-a.score).slice(0,limit); }

async function extractPdf(file){
  try{
    const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs';
    const data=new Uint8Array(await file.arrayBuffer()); const pdf=await pdfjs.getDocument({data}).promise; const pages=[];
    for(let i=1;i<=pdf.numPages;i++){ const page=await pdf.getPage(i); const content=await page.getTextContent(); pages.push(`[[Page ${i}]]\n`+content.items.map(x=>x.str).join(' ')); }
    return pages.join('\n\n');
  }catch(error){ throw new Error(`PDF extraction failed: ${error.message}`); }
}
async function extractFile(file){
  if(file.size>20*1024*1024) throw new Error(`${file.name}: 20 MB local limit exceeded`);
  const lower=file.name.toLowerCase();
  if(file.type==='application/pdf'||lower.endsWith('.pdf')) return extractPdf(file);
  if(/\.(txt|md|markdown|csv|html|htm)$/i.test(lower)||file.type.startsWith('text/')){ const text=await file.text(); if(/\.html?$/i.test(lower)){ const doc=new DOMParser().parseFromString(text,'text/html'); return doc.body?.innerText||text; } return text; }
  throw new Error(`${file.name}: unsupported format`);
}
async function importFiles(files){
  const status=$('#statusbar').firstElementChild; status.innerHTML='<i class="pulse"></i> Extracting and indexing locally…';
  for(const file of [...files].slice(0,25-state.documents.length)){
    try{ const text=await extractFile(file); const id=uid('DOC'); const doc={id,name:file.name,type:file.type||'file',size:file.size,text,addedAt:new Date().toISOString()}; await dbPut(doc); state.documents.push(doc); }
    catch(error){ alert(error.message); }
  }
  rebuildChunks(); renderDocuments(); renderSourceTray(); status.innerHTML='<i class="pulse"></i> Local index ready'; await updateStorageStatus();
}

function renderDocuments(){
  $('#documentCount').textContent=state.documents.length;
  if(!state.documents.length){ $('#docList').innerHTML='<div class="empty-state">No local documents yet. Upload a source or paste text to begin.</div>'; return; }
  $('#docList').innerHTML=state.documents.map(d=>`<article class="doc-card"><span class="doc-icon">${d.name.toLowerCase().endsWith('.pdf')?'PDF':'TXT'}</span><div><strong>${escapeHtml(d.name)}</strong><small>${formatBytes(d.size)} · ${chunkText(d.text,d.id,d.name).length} chunks</small></div><button data-remove-doc="${escapeHtml(d.id)}" title="Remove">×</button></article>`).join('');
  $$('[data-remove-doc]').forEach(btn=>btn.onclick=async()=>{ await dbDelete(btn.dataset.removeDoc); state.documents=state.documents.filter(d=>d.id!==btn.dataset.removeDoc); rebuildChunks(); renderDocuments(); renderSourceTray(); await updateStorageStatus(); });
}
function renderCapacity(){ const words=state.documents.reduce((n,d)=>n+tokenize(d.text).length,0); $('#capacityText').textContent=`${state.documents.length} document${state.documents.length===1?'':'s'} · ${state.chunks.length} chunks · ${words.toLocaleString()} indexed words`; }
function renderSourceTray(){
  const docs=state.documents.map(d=>({label:d.name,id:d.id,kind:'doc'})); const captures=state.capturedSources.map((s,i)=>({label:s.title||s.url||`Captured ${i+1}`,id:`cap-${i}`,kind:'cap'}));
  $('#sourceTray').innerHTML=[...docs,...captures].map(x=>`<span class="source-chip">${escapeHtml(x.label)} · <a href="#" data-remove-source="${escapeHtml(x.id)}" data-kind="${x.kind}">×</a></span>`).join('');
  $$('[data-remove-source]').forEach(a=>a.onclick=async(e)=>{e.preventDefault();if(a.dataset.kind==='doc'){await dbDelete(a.dataset.removeSource);state.documents=state.documents.filter(d=>d.id!==a.dataset.removeSource);renderDocuments();}else{const idx=Number(a.dataset.removeSource.replace('cap-',''));state.capturedSources.splice(idx,1);}rebuildChunks();renderSourceTray();});
}
function renderSearchResults(results){
  $('#localResults').innerHTML=results.length?results.map(r=>`<div class="passage-result"><button data-passage="${escapeHtml(r.id)}">${escapeHtml(r.id)} · ${escapeHtml(r.title)}</button><p>${escapeHtml(truncate(r.text,340))}</p></div>`).join(''):'<div class="empty-state small">No matching passages in the local index.</div>';
  $$('[data-passage]').forEach(b=>b.onclick=()=>showPassage(b.dataset.passage));
}
function showPassage(id){ const chunk=state.chunks.find(c=>c.id===id); if(!chunk)return; $('#passageId').textContent=id;$('#passageTitle').textContent=chunk.title;$('#passageText').textContent=chunk.text;$('#passageDialog').showModal(); }

function localBrief(question,mode,retrieved){
  const evidence=retrieved.length?retrieved:state.chunks.slice(0,5);
  const claims=evidence.slice(0,3).map((c,i)=>({id:`C${i+1}`,text:extractiveSentence(c.text,question),evidence:[c.id],strength:i===0?'strong':'medium'}));
  const overview=claims.length?claims.map(c=>c.text).join(' '):'No indexed evidence matched the question yet. Add sources or broaden the wording.';
  const conf=Math.min(.86,.42+Math.min(evidence.length,6)*.07);
  return {id:uid('brief'),mode:mode==='recommend'?'Recommendation Brief':mode==='compare'?'Comparison Brief':'Evidence Brief',title:question.length>78?question.slice(0,75)+'…':question,question,status:evidence.length?'SUPPORTED WITH GAPS':'INSUFFICIENT EVIDENCE',confidence:evidence.length?conf:.15,overview,claims,gaps:[evidence.length<2?'Only one or zero relevant passages were retrieved; corroboration is weak.':'The local retrieval ranks relevance, not factual truth or source quality.','Freshness of uploaded documents cannot be inferred unless the source itself includes a date.'],nextMoves:['Add an independent source that could falsify the leading conclusion.','Open the cited passages and verify the wording before acting.'],sources:evidence.map(c=>({id:c.id,title:c.title,url:'',kind:'local-document',perspective:'user-provided',passage:c.text})),lineage:[{stage:'Question',detail:question},{stage:'Local retrieval',detail:`${evidence.length} passages selected from ${state.chunks.length} indexed chunks`},{stage:'Claims',detail:`${claims.length} extractive claims tied to passage IDs`},{stage:'Decision state',detail:'Local fallback · no external generation'}],model:'local-extractive',generatedAt:new Date().toISOString()};
}
function extractiveSentence(text,question){ const q=tokenize(question); const sentences=String(text||'').replace(/\s+/g,' ').split(/(?<=[.!?])\s+/).filter(s=>s.length>35); let best=sentences[0]||truncate(text,220),score=-1; for(const s of sentences){const toks=new Set(tokenize(s));const sc=q.reduce((n,t)=>n+(toks.has(t)?1:0),0);if(sc>score){score=sc;best=s}} return truncate(best,320); }

function renderBrief(b){
  state.brief=b; localStorage.setItem('research-ledger:last-brief',JSON.stringify(b));
  $('#briefType').textContent=(b.mode||'Evidence Brief').toUpperCase(); $('#briefTitle').textContent=b.title||b.question; $('#briefStatus').textContent=b.status||'WORKING';
  const pct=Math.round((Number(b.confidence)||0)*100); $('#confidenceText').textContent=`${pct}%`;$('#confidenceMeter').style.width=`${pct}%`;$('#overview').textContent=b.overview||'';$('#briefVersion').textContent=`V${state.version} · ${b.model||'local'}`;
  $('#claims').innerHTML=(b.claims||[]).length?(b.claims||[]).map(c=>`<div class="claim"><span class="claim-id">${escapeHtml(c.id)}</span><div><p>${escapeHtml(c.text)}</p><div class="strength">${escapeHtml(c.strength||'')}</div></div><div class="evidence">${(c.evidence||[]).map(e=>`<button data-passage="${escapeHtml(e)}">${escapeHtml(e)}</button>`).join('')}</div></div>`).join(''):'<div class="empty-state small">No grounded claims returned.</div>';
  $('#gaps').innerHTML=(b.gaps||[]).map(g=>`<li>${escapeHtml(g)}</li>`).join(''); $('#nextMoves').innerHTML=(b.nextMoves||[]).map(n=>`<li>${escapeHtml(n)}</li>`).join('');
  $('#sourceCount').textContent=(b.sources||[]).length; $('#sources').innerHTML=(b.sources||[]).length?(b.sources||[]).map(s=>`<div class="source-item"><div class="source-top"><span class="source-id">${escapeHtml(s.id)}</span><div><button data-passage="${escapeHtml(s.id)}"><strong>${escapeHtml(s.title||s.id)}</strong></button><small>${escapeHtml(s.kind||'source')} · ${escapeHtml(s.perspective||'')}</small><span class="fresh">exact passage available locally</span></div></div></div>`).join(''):'<div class="empty-state small">No retrieved passages.</div>';
  $('#lineage').innerHTML=(b.lineage||[]).map(l=>`<div class="lineage-step"><strong>${escapeHtml(l.stage)}</strong><p>${escapeHtml(l.detail)}</p></div>`).join('');
  $$('[data-passage]').forEach(btn=>btn.onclick=()=>showPassage(btn.dataset.passage));
}

async function providerStatus(){
  try{ const r=await fetch('/api/research'); const d=await r.json(); state.provider={live:!!d.live,model:d.model||'local'}; }
  catch{ state.provider={live:false,model:'local'}; }
  $('#providerPill').textContent=state.provider.live?`Live AI · ${state.provider.model}`:'Local-only mode'; $('#runMode').textContent=state.provider.live?'Local retrieval + live grounded generation':'Local retrieval + extractive fallback';
}
async function createBrief(){
  const question=$('#question').value.trim(); if(!question)return; const retrieved=retrieve(question,7); renderSearchResults(retrieved); $('#statusbar').firstElementChild.innerHTML='<i class="pulse"></i> Retrieving grounded passages…'; $('#createBrief').disabled=true;
  try{
    let brief;
    if(state.provider.live){
      const r=await fetch('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:'research',question,mode:state.mode,evidence:retrieved.map(c=>({id:c.id,title:c.title,text:c.text,kind:'local-document'})),capturedSources:state.capturedSources.slice(0,8)})}); const d=await r.json(); if(!r.ok)throw new Error(d.error||'Research failed'); brief=d.brief;
    } else brief=localBrief(question,state.mode,retrieved);
    state.version++; renderBrief(brief); $('#statusbar').firstElementChild.innerHTML='<i class="pulse"></i> Grounded brief ready';
  }catch(error){ const brief=localBrief(question,state.mode,retrieved);brief.gaps.unshift(`Live generation failed; local fallback used: ${error.message}`);renderBrief(brief);$('#statusbar').firstElementChild.innerHTML='<i class="pulse"></i> Local fallback ready'; }
  finally{$('#createBrief').disabled=false;}
}

function localArtifact(type,retrieved){
  const ev=retrieved.length?retrieved:state.chunks.slice(0,6); const cite=ev.map(c=>c.id); const lines=ev.slice(0,5).map(c=>extractiveSentence(c.text,$('#question').value));
  if(type==='faq'){return {type,title:'Evidence FAQ',content:lines.map((x,i)=>`Q${i+1}. What does the evidence say about point ${i+1}?\nA. ${x} [${ev[i].id}]`).join('\n\n'),citations:cite};}
  if(type==='study-guide'){return {type,title:'Study Guide',content:`KEY IDEAS\n${lines.map((x,i)=>`${i+1}. ${x} [${ev[i]?.id}]`).join('\n')}\n\nSELF-CHECK\n1. Which claim has the strongest direct passage support?\n2. Which conclusion would change if a key source were wrong?\n3. What evidence is still missing?`,citations:cite};}
  if(type==='podcast'){ const turns=[]; ev.slice(0,6).forEach((c,i)=>turns.push(`${i%2?'HOST B':'HOST A'}: ${extractiveSentence(c.text,$('#question').value)} [${c.id}]`)); return {type,title:'Two-host evidence briefing',content:turns.join('\n\n'),citations:cite}; }
  return {type:'summary',title:'Grounded Summary',content:lines.map((x,i)=>`• ${x} [${ev[i]?.id}]`).join('\n'),citations:cite};
}
async function generateArtifact(type,button){
  const question=$('#question').value.trim()||'Summarize the current evidence set'; const retrieved=retrieve(question,8); if(!retrieved.length&&state.chunks.length)retrieved.push(...state.chunks.slice(0,8)); if(!retrieved.length){$('#artifactPanel').innerHTML='<div class="empty-state">Add or upload at least one source first.</div>';return;}
  $$('.studio-actions button').forEach(b=>b.classList.remove('active'));button.classList.add('active');$('#artifactPanel').innerHTML='<div class="empty-state">Generating from the retrieved passages…</div>';
  let artifact;
  try{ if(state.provider.live){ const r=await fetch('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:type,question,evidence:retrieved.map(c=>({id:c.id,title:c.title,text:c.text,kind:'local-document'}))})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Generation failed');artifact=d.artifact;} else artifact=localArtifact(type,retrieved); }
  catch{ artifact=localArtifact(type,retrieved); }
  state.artifact=artifact; renderArtifact(artifact);
}
function renderArtifact(a){ $('#artifactPanel').innerHTML=`<h3>${escapeHtml(a.title||'Studio output')}</h3><div class="artifact-body">${escapeHtml(a.content||'')}</div><div class="artifact-citations">${(a.citations||[]).map(c=>`<button data-passage="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}</div>`; $$('[data-passage]').forEach(b=>b.onclick=()=>showPassage(b.dataset.passage)); $('#podcastControls').hidden=a.type!=='podcast'; }
function speakPodcast(){ if(!state.artifact||state.artifact.type!=='podcast'||!('speechSynthesis'in window))return; speechSynthesis.cancel(); const voices=speechSynthesis.getVoices(); const a=voices[0],b=voices.find(v=>v.name!==a?.name)||voices[1]||a; const lines=state.artifact.content.split(/\n+/).filter(Boolean); lines.forEach(line=>{const u=new SpeechSynthesisUtterance(line.replace(/^HOST [AB]:\s*/,'').replace(/\[[^\]]+\]/g,''));u.voice=line.startsWith('HOST B')?b:a;u.rate=1.02;speechSynthesis.speak(u);}); }

async function digestText(text){ const bytes=new TextEncoder().encode(text); const hash=await crypto.subtle.digest('SHA-256',bytes); return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function updateEvidenceHash(){ const canonical=state.documents.map(d=>`${d.id}:${d.name}:${d.text}`).join('\n---\n')+'\n'+state.capturedSources.map(s=>`${s.title}:${s.url}:${s.text}`).join('\n---\n'); state.currentEvidenceHash=await digestText(canonical); }
async function runDrift(){ await updateEvidenceHash(); if(!state.lastEvidenceHash){localStorage.setItem('research-ledger:evidence-hash',state.currentEvidenceHash);state.lastEvidenceHash=state.currentEvidenceHash;$('#driftState').textContent='baseline saved';$('#driftCount').textContent='0';return;} const changed=state.lastEvidenceHash!==state.currentEvidenceHash; $('#driftState').textContent=changed?'evidence changed':'no local change';$('#driftCount').textContent=changed?'1':'0'; if(changed&&state.brief){state.brief.gaps=[...(state.brief.gaps||[]),'The local evidence set changed after this brief was produced; rerun before relying on it.'];renderBrief(state.brief);} localStorage.setItem('research-ledger:evidence-hash',state.currentEvidenceHash);state.lastEvidenceHash=state.currentEvidenceHash; }

async function updateStorageStatus(){ try{const e=await navigator.storage?.estimate?.(); if(e){$('#storageStatus').textContent=`Browser storage · ${formatBytes(e.usage||0)} used of ${formatBytes(e.quota||0)}`;return;}}catch{} $('#storageStatus').textContent='Browser storage · local persistence enabled'; }

const sourceDialog=$('#sourceDialog'); let dialogKind='url';
function openSourceDialog(kind){ dialogKind=kind; $('#dialogTitle').textContent=kind==='chat'?'Import AI chat':kind==='rea'?'Import REA evidence bundle':kind==='tabs'?'Capture browser research':'Add source'; $('#dialogHelp').textContent=kind==='chat'?'Paste the exchange you want to preserve. It is context, not independent verification.':kind==='rea'?'Paste an REA evidence/capability report or JSON bundle. It is preserved as provenance-bearing context.':kind==='tabs'?'The companion extension captures only tabs you explicitly select. Paste URL/text here in the hosted build.':'Add a URL and/or pasted text. Pasted text is indexed locally.'; $('#sourceUrl').style.display=kind==='chat'||kind==='rea'?'none':'block'; sourceDialog.showModal(); }

$('#uploadDocs').onclick=()=>$('#fileInput').click(); $('#fileInput').onchange=async(e)=>{await importFiles(e.target.files);e.target.value='';};
$('#runLocalSearch').onclick=()=>renderSearchResults(retrieve($('#localSearch').value.trim(),10)); $('#localSearch').addEventListener('keydown',e=>{if(e.key==='Enter')$('#runLocalSearch').click()});
$('#addUrl').onclick=()=>openSourceDialog('url'); $('#pasteSource').onclick=()=>openSourceDialog('paste'); $('#importChat').onclick=()=>openSourceDialog('chat'); $('#importTabs').onclick=()=>openSourceDialog('tabs'); $('#importRea').onclick=()=>openSourceDialog('rea');
$('#confirmSource').onclick=e=>{e.preventDefault();const title=$('#sourceTitle').value.trim();const url=$('#sourceUrl').value.trim();const text=$('#sourceText').value.trim();if(!url&&!text)return;state.capturedSources.push({id:uid('CAP'),title:title||(dialogKind==='chat'?'AI chat context':dialogKind==='rea'?'REA evidence bundle':url||'Pasted source'),url,text,kind:dialogKind==='chat'?'ai-context':dialogKind==='rea'?'rea-evidence':'captured',perspective:dialogKind==='chat'?'context-only':'user-selected'});rebuildChunks();renderSourceTray();$('#sourceTitle').value='';$('#sourceUrl').value='';$('#sourceText').value='';sourceDialog.close();};
$$('#modes button').forEach(b=>b.onclick=()=>{$$('#modes button').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');state.mode=b.dataset.mode;});
$('#createBrief').onclick=createBrief; $('#question').addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter')createBrief()});
$$('[data-artifact]').forEach(b=>b.onclick=()=>generateArtifact(b.dataset.artifact,b)); $('#playPodcast').onclick=speakPodcast;$('#stopPodcast').onclick=()=>speechSynthesis?.cancel?.();
$('#recheck').onclick=$('#runDrift').onclick=runDrift; $('#newVariant').onclick=()=>{state.version++;openSourceDialog('url')};
$('#newBrief').onclick=()=>{$('#question').value='';state.brief=null;$('#question').focus();window.scrollTo({top:0,behavior:'smooth'});};
$('#notebookName').onchange=()=>localStorage.setItem('research-ledger:notebook-name',$('#notebookName').value.trim()||'Untitled notebook');
$('#wipeData').onclick=async()=>{if(!confirm('Delete all documents, local research snapshots, and notebook state from this browser?'))return;await dbClear();localStorage.removeItem('research-ledger:last-brief');localStorage.removeItem('research-ledger:evidence-hash');state.documents=[];state.chunks=[];state.capturedSources=[];state.brief=null;state.lastEvidenceHash='';renderDocuments();renderCapacity();renderSourceTray();renderSearchResults([]);$('#briefTitle').textContent='Your next grounded answer appears here';$('#overview').textContent='Local data cleared. Upload sources or paste evidence to begin again.';await updateStorageStatus();};
function download(name,text,type='text/plain'){const blob=new Blob([text],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('#exportJson').onclick=()=>download('research-ledger-notebook.json',JSON.stringify({notebook:$('#notebookName').value,brief:state.brief,artifact:state.artifact,documents:state.documents.map(({text,...d})=>({...d,text})),captures:state.capturedSources,exportedAt:new Date().toISOString()},null,2),'application/json');
$('#downloadMd').onclick=()=>{const b=state.brief;if(!b)return;const md=`# ${b.title}\n\n**Status:** ${b.status} · **Confidence:** ${Math.round((b.confidence||0)*100)}%\n\n## Working conclusion\n${b.overview}\n\n## Claims\n${(b.claims||[]).map(c=>`- ${c.text} (${(c.evidence||[]).join(', ')})`).join('\n')}\n\n## Evidence gaps\n${(b.gaps||[]).map(g=>`- ${g}`).join('\n')}\n\n## Retrieved evidence\n${(b.sources||[]).map(s=>`- ${s.id}: ${s.title}`).join('\n')}`;download('research-ledger-brief.md',md)};
$('#copyLink').onclick=async()=>{if(!state.brief)return;await navigator.clipboard.writeText(JSON.stringify(state.brief));$('#copyLink').textContent='Snapshot copied';setTimeout(()=>$('#copyLink').textContent='Copy snapshot',1400)};
$('#handoff').onclick=()=>{const b=state.brief;if(!b)return;download('agent-work-os-handoff.json',JSON.stringify({type:'agent-work-os-research-handoff',notebook:$('#notebookName').value,briefId:b.id,question:b.question,status:b.status,acceptedConclusion:b.overview,evidenceIds:(b.sources||[]).map(s=>s.id),openGaps:b.gaps,nextMoves:b.nextMoves,evidenceHash:state.currentEvidenceHash},null,2),'application/json')};

const params=new URLSearchParams(location.search);if(params.get('capture')){try{const c=JSON.parse(atob(params.get('capture')));state.capturedSources.push({...c,id:uid('CAP')});if(c.title)$('#question').value=`What should I know or decide from “${c.title}”?`;}catch{}}
(async function init(){ $('#notebookName').value=localStorage.getItem('research-ledger:notebook-name')||'Product research'; state.documents=await dbAll(); rebuildChunks(); renderDocuments(); renderSourceTray(); await providerStatus(); await updateStorageStatus(); const saved=localStorage.getItem('research-ledger:last-brief'); if(saved){try{renderBrief(JSON.parse(saved));}catch{}} })();
