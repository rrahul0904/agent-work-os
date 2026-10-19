const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const state = { session: null, brief: null, markdown: "", followup: null, draft: null };

function esc(value="") {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function notice(el, message, kind="") {
  el.textContent = message;
  el.className = `notice ${kind}`.trim();
}
function hide(el){ el.classList.add("hidden"); }
function pill(label, value){ return `<span>${esc(label)}: <strong>${esc(value)}</strong></span>`; }

$$('.tab').forEach((button) => button.addEventListener("click", () => {
  $$('.tab').forEach((x) => x.classList.toggle("active", x === button));
  $$('.panel').forEach((x) => x.classList.toggle("active", x.id === button.dataset.tab));
  if (button.dataset.tab === "library") renderLibrary();
}));

const sampleClaude = [
  {type:"user",uuid:"u1",message:{role:"user",content:"The checkout tests are timing out. Fix them without changing public behavior."}},
  {type:"assistant",uuid:"a1",message:{role:"assistant",content:[
    {type:"thinking",thinking:"Inspect the test and the network mock first."},
    {type:"tool_use",id:"call_1",name:"Agent",input:{prompt:"Inspect checkout test timeout"}},
    {type:"tool_result",tool_use_id:"call_1",content:"The fake payment service waits 15s while the test timeout is 10s."},
    {type:"text",text:"I found the failure: the mock delay exceeds the test timeout. I will make the mock deterministic."}
  ]}}
].map(JSON.stringify).join("\n");

$("#sampleSession").addEventListener("click", () => $("#sessionInput").value = sampleClaude);
let limitTimer=null;
$("#sessionInput").addEventListener("input",()=>{
  clearTimeout(limitTimer);
  limitTimer=setTimeout(async()=>{
    const text=$("#sessionInput").value;
    if(!text)return;
    try{
      const data=await sessionApi({action:"detect-limit",text});
      if(data.limited) notice($("#handoffNotice"),`Limit signal detected${data.resetHint?` · reset ${data.resetHint}`:""}. Continue in another agent or fork the session.`,"warn");
    }catch{}
  },350);
});

async function sessionApi(payload) {
  const response = await fetch("/api/session", {
    method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Session API failed");
  return data;
}

$("#detectLimit").addEventListener("click", async () => {
  const el = $("#handoffNotice");
  try {
    const data = await sessionApi({ action:"detect-limit", text:$("#sessionInput").value });
    notice(el, data.limited ? `Limit signal detected${data.resetHint ? ` · reset ${data.resetHint}` : ""}. Handoff is appropriate.` : "No limit signal detected.", data.limited ? "warn" : "");
  } catch (e) { notice(el, e.message, "bad"); }
});

$("#handoffButton").addEventListener("click", async () => {
  const el = $("#handoffNotice");
  try {
    const data = await sessionApi({
      action:"handoff",
      input:$("#sessionInput").value,
      sourceAgent:$("#sourceAgent").value,
      targetAgent:$("#targetAgent").value,
      fromMessageId:$("#fromMessageId").value.trim() || null,
      fork:$("#forkToggle").checked
    });
    state.session = data.canonical;
    $("#sessionOutput").textContent = data.serialized;
    const tools = data.canonical.messages.flatMap((m)=>m.toolCalls||[]);
    $("#sessionStats").innerHTML =
      pill("messages", data.canonical.messages.length) +
      pill("tool calls", tools.length) +
      pill("from", data.canonical.metadata.handedOffFrom) +
      pill("to", data.canonical.metadata.handedOffTo);
    notice(el, `Session ${$("#forkToggle").checked ? "forked and " : ""}converted. Unknown source-agent tools remain visible as history but are not presented as callable target tools.`);
  } catch (e) { notice(el, e.message, "bad"); }
});

$("#exportSession").addEventListener("click", async () => {
  if (!state.session) return;
  const data = await sessionApi({ action:"export", session:state.session, sourceAgent:"generic" });
  download("agent-session-bundle.json", data.bundle, "application/json");
});
$("#saveSession").addEventListener("click", () => {
  if (!state.session) return;
  saveLibrary({ kind:"session", title:`${state.session.sourceAgent} → ${state.session.currentAgent}`, data:state.session });
});

function sourceRow(data={}) {
  const id = crypto.randomUUID();
  const div = document.createElement("div");
  div.className = "source";
  div.dataset.sourceId = id;
  div.innerHTML = `
    <div class="source-top">
      <input class="source-title" placeholder="Source title" value="${esc(data.title||"")}">
      <button class="remove-source" title="Remove">×</button>
    </div>
    <input class="source-url" placeholder="https://…" value="${esc(data.url||"")}">
    <textarea class="source-text" placeholder="Paste source text, notes, or an AI conversation…">${esc(data.text||"")}</textarea>`;
  div.querySelector(".remove-source").addEventListener("click",()=>div.remove());
  $("#sourceList").appendChild(div);
}
sourceRow();

$("#addSource").addEventListener("click",()=>sourceRow());
$("#sampleResearch").addEventListener("click",()=>{
  $("#sourceList").innerHTML="";
  sourceRow({title:"Project note — earlier",text:"The team plans to launch on October 20, 2026. The release requires a final QA pass before launch. Approval was expected earlier that week."});
  sourceRow({title:"Project note — later",text:"The team plans to launch on October 27, 2026, pending approval. The release requires a final QA pass before launch. Approval has not yet been granted."});
  $("#researchQuery").value="When should we treat the launch date as confirmed?";
  $("#briefType").value="source-comparison";
});

function gatherSources(){
  return $$(".source").map((el)=>({
    title:el.querySelector(".source-title").value.trim(),
    url:el.querySelector(".source-url").value.trim()||null,
    text:el.querySelector(".source-text").value.trim(),
    kind:"manual"
  })).filter((s)=>s.title||s.url||s.text);
}

async function briefApi(payload){
  const response=await fetch("/api/brief",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  const data=await response.json();
  if(!response.ok) throw new Error(data.error||"Brief API failed");
  return data;
}

$("#buildBrief").addEventListener("click",async()=>{
  const el=$("#researchNotice");
  try{
    const data=await briefApi({
      query:$("#researchQuery").value,
      briefType:$("#briefType").value,
      discover:$("#discoverWeb").checked,
      sources:gatherSources()
    });
    state.brief=data.brief;state.markdown=data.markdown;
    renderBrief(data.brief);
    if(data.warnings?.length) notice(el,data.warnings.join(" "), "warn"); else notice(el,"Brief created. Claims remain linked to their source labels.");
  }catch(e){notice(el,e.message,"bad")}
});

function listHtml(values, formatter=(x)=>x){
  if(!Array.isArray(values)||!values.length)return '<p class="muted">None.</p>';
  return `<ul>${values.map((x)=>`<li>${formatter(x)}</li>`).join("")}</ul>`;
}
function renderBrief(b){
  $("#briefTitle").textContent=b.title;
  $("#briefMeta").innerHTML=pill("evidence",b.evidenceStrength)+pill("confidence",b.confidence)+pill("sources",b.sources?.length||0)+pill("conflicts",b.conflicts?.length||0);
  const sections=[];
  if(b.answer)sections.push(["Answer",`<p>${esc(b.answer)}</p>`]);
  for(const [key,label] of [["summary","Summary"],["themes","Themes"],["answered","Answered"],["uniqueClaims","Unique claims"]]){
    if(b[key]?.length)sections.push([label,listHtml(b[key],esc)]);
  }
  const disagreements=b.disagreements||b.partial||b.tensions;
  if(disagreements?.length)sections.push(["Conflicts",disagreements.map((x)=>`<div class="conflict">${esc(x.issue||x.statement||JSON.stringify(x))}</div>`).join("")]);
  if(b.open?.length||b.openQuestions?.length)sections.push(["Open questions",listHtml(b.open||b.openQuestions,esc)]);
  if(b.nextResearchMove)sections.push(["Next research move",`<p>${esc(b.nextResearchMove)}</p>`]);
  if(b.options?.length)sections.push(["Options",b.options.map((o)=>`<h4>${esc(o.option)}</h4>${listHtml(o.evidence,esc)}`).join("")]);
  if("recommendation" in b)sections.push(["Recommendation",`<p><strong>${esc(b.recommendation||"No firm recommendation")}</strong></p><p>${esc(b.rationale||"")}</p>`]);
  if(b.gaps?.length)sections.push(["Evidence gaps",listHtml(b.gaps,(x)=>esc(x.issue||x))]);
  sections.push(["Sources",listHtml(b.sources,(s)=>`<span class="citation">[${esc(s.label)}]</span> ${esc(s.title)}${s.url?` · ${esc(s.url)}`:""}`)]);
  $("#briefView").className="brief-view";
  $("#briefView").innerHTML=sections.map(([h,v])=>`<h3>${esc(h)}</h3>${v}`).join("");
}
$("#copyBrief").addEventListener("click",async()=>{if(state.markdown)await navigator.clipboard.writeText(state.markdown)});
$("#saveBrief").addEventListener("click",()=>{if(state.brief)saveLibrary({kind:"brief",title:state.brief.title,data:state.brief,markdown:state.markdown})});
$("#askBrief").addEventListener("click",async()=>{
  const view=$("#followupView");
  if(!state.brief){view.textContent="Create or open a brief first.";return}
  try{
    const data=await briefApi({action:"ask",brief:state.brief,question:$("#briefQuestion").value});
    state.followup=data.result;
    const r=data.result;
    view.innerHTML=`<h4>Answer · ${esc(r.confidence)}</h4><p>${esc(r.answer)}</p>${r.evidence?.length?listHtml(r.evidence,esc):""}${r.conflicts?.length?`<div class="conflict">${esc(r.conflicts.length)} relevant conflict${r.conflicts.length===1?"":"s"} remain unresolved.</div>`:""}${r.nextMove?`<p><strong>Next:</strong> ${esc(r.nextMove)}</p>`:""}`;
  }catch(e){view.textContent=e.message}
});

$("#draftBrief").addEventListener("click",async()=>{
  const view=$("#followupView");
  if(!state.brief){view.textContent="Create or open a brief first.";return}
  try{
    const data=await briefApi({action:"draft",brief:state.brief,format:$("#draftFormat").value,audience:"team"});
    state.draft=data.result;
    view.innerHTML=`<div class="row-actions"><strong>Draft</strong><button id="copyGeneratedDraft" class="icon-btn">Copy</button></div><pre class="output compact-output">${esc(data.result.draft)}</pre>`;
    $("#copyGeneratedDraft").onclick=()=>navigator.clipboard.writeText(data.result.draft);
  }catch(e){view.textContent=e.message}
});

function parsePairs(text){
  return Object.fromEntries(String(text).split(/\n/).map((x)=>x.split("=")).filter((x)=>x.length>=2).map(([a,...b])=>[a.trim().toLowerCase(),b.join("=").trim()]).filter(([a,b])=>a&&b));
}
function cleanupVoice(text){
  let out=String(text).replace(/\b(um+|uh+|you know)\b[,]?\s*/gi," ").replace(/\s+/g," ").trim();
  const dict=parsePairs($("#dictionary").value);
  for(const [from,to] of Object.entries(dict))out=out.replace(new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`,"gi"),to);
  const snippets=parsePairs($("#snippets").value);
  if(snippets[out.toLowerCase()])out=snippets[out.toLowerCase()];
  if(out)out=out[0].toUpperCase()+out.slice(1);
  return out;
}
let recognition=null;
const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
if(!SpeechRecognition){$("#voiceEngine").textContent="speech API unavailable";$("#voiceButton").disabled=true}
else{
  recognition=new SpeechRecognition();recognition.continuous=true;recognition.interimResults=true;
  recognition.onresult=(event)=>{$("#voiceTranscript").value=[...event.results].map((r)=>r[0].transcript).join(" ")};
  recognition.onend=()=>{$("#voiceButton").classList.remove("live");$("#voiceButtonText").textContent="Start dictation"};
}
$("#voiceButton").addEventListener("click",()=>{
  if(!recognition)return;
  if($("#voiceButton").classList.contains("live"))recognition.stop();
  else{recognition.start();$("#voiceButton").classList.add("live");$("#voiceButtonText").textContent="Stop dictation"}
});
$("#cleanVoice").addEventListener("click",()=>$("#voiceTranscript").value=cleanupVoice($("#voiceTranscript").value));
$("#sendVoiceResearch").addEventListener("click",()=>{ $("#researchQuery").value=cleanupVoice($("#voiceTranscript").value);$(".tab[data-tab=research]").click() });
$("#sendVoiceSession").addEventListener("click",()=>{ $("#sessionInput").value=JSON.stringify({role:"user",content:cleanupVoice($("#voiceTranscript").value)});$("#sourceAgent").value="generic";$(".tab[data-tab=handoff]").click() });
$("#saveVoicePrefs").addEventListener("click",()=>localStorage.setItem("cc_voice_prefs",JSON.stringify({dictionary:$("#dictionary").value,snippets:$("#snippets").value})));
try{const p=JSON.parse(localStorage.getItem("cc_voice_prefs"));if(p){$("#dictionary").value=p.dictionary||"";$("#snippets").value=p.snippets||""}}catch{}

function saveLibrary(item){
  const library=JSON.parse(localStorage.getItem("cc_library")||"[]");
  library.unshift({...item,id:crypto.randomUUID(),savedAt:new Date().toISOString()});
  localStorage.setItem("cc_library",JSON.stringify(library.slice(0,60)));
  renderLibrary();
}
function renderLibrary(){
  const library=JSON.parse(localStorage.getItem("cc_library")||"[]");
  $("#libraryList").innerHTML=library.length?library.map((item)=>`
    <div class="library-item">
      <div><strong>${esc(item.title)}</strong><br><small>${esc(item.kind)} · ${new Date(item.savedAt).toLocaleString()}</small></div>
      <button class="icon-btn" data-open="${esc(item.id)}">Open</button>
    </div>`).join(""):'<p class="muted">Nothing saved yet.</p>';
  $$("[data-open]").forEach((b)=>b.onclick=()=>{
    const item=library.find((x)=>x.id===b.dataset.open);if(!item)return;
    if(item.kind==="session"){state.session=item.data;$("#sessionOutput").textContent=JSON.stringify(item.data,null,2);$(".tab[data-tab=handoff]").click()}
    else{state.brief=item.data;state.markdown=item.markdown||"";renderBrief(item.data);$(".tab[data-tab=research]").click()}
  });
}
$("#clearLibrary").addEventListener("click",()=>{localStorage.removeItem("cc_library");renderLibrary()});

function download(name,content,type){
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
}

function importCaptureFragment(){
  const match=location.hash.match(/capture=([^&]+)/);if(!match)return;
  try{
    const decoded=JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(match[1])))));
    if(decoded?.sources?.length){
      $("#sourceList").innerHTML="";
      decoded.sources.forEach(sourceRow);
      notice($("#researchNotice"),`Imported ${decoded.sources.length} selected tab${decoded.sources.length===1?"":"s"}. Review the captured text before creating a brief.`);
      $(".tab[data-tab=research]").click();
      history.replaceState(null,"",location.pathname+location.search);
    }
  }catch(e){console.warn("Capture import failed",e)}
}
importCaptureFragment();
