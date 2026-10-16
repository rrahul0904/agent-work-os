const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-6-astra';
const MAX_EVIDENCE = 10;
const MAX_PASSAGE_CHARS = 5000;

function outputText(data){
  if(typeof data?.output_text==='string') return data.output_text;
  const chunks=[];
  for(const item of data?.output||[]) if(item.type==='message') for(const part of item.content||[]) if(part.type==='output_text'&&part.text) chunks.push(part.text);
  return chunks.join('\n');
}
function parseJsonish(text){
  const cleaned=String(text||'').trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(cleaned)}catch{}
  const a=cleaned.indexOf('{'),b=cleaned.lastIndexOf('}'); if(a>=0&&b>a){try{return JSON.parse(cleaned.slice(a,b+1))}catch{}}
  return null;
}
function safeEvidence(input){
  return (Array.isArray(input)?input:[]).slice(0,MAX_EVIDENCE).map((e,i)=>({id:String(e.id||`E${i+1}`).slice(0,80),title:String(e.title||`Evidence ${i+1}`).slice(0,240),text:String(e.text||'').slice(0,MAX_PASSAGE_CHARS),kind:String(e.kind||'source').slice(0,60)})).filter(e=>e.text.trim());
}
function live(){return Boolean(process.env.OPENAI_API_KEY)}

function briefSchema(){return `Return ONLY valid JSON with this shape:
{
  "mode":"Evidence Brief|Comparison Brief|Recommendation Brief",
  "title":"short title",
  "question":"original question",
  "status":"SUPPORTED|SUPPORTED WITH GAPS|PROVISIONAL|INSUFFICIENT EVIDENCE",
  "confidence":0.0,
  "overview":"direct grounded answer",
  "claims":[{"id":"C1","text":"claim","evidence":["EXACT_EVIDENCE_ID"],"strength":"strong|medium|weak"}],
  "gaps":["explicit evidence gap"],
  "nextMoves":["bounded next research move"],
  "sources":[{"id":"EXACT_EVIDENCE_ID","title":"source title","url":"","kind":"local-document","perspective":"user-provided"}],
  "lineage":[{"stage":"Question|Local retrieval|Claims|Decision state","detail":"..."}]
}. Every substantive claim MUST cite one or more evidence IDs exactly as provided. Never invent an evidence ID, URL or source.`}
function artifactSchema(type){return `Return ONLY valid JSON with this shape: {"type":"${type}","title":"short title","content":"plain text with inline [EVIDENCE_ID] citations","citations":["EVIDENCE_ID"]}. Use only evidence IDs provided. ${type==='podcast'?'Format the content as alternating HOST A: and HOST B: turns.':''}`}

export default async function handler(req,res){
  if(req.method==='GET') return res.status(200).json({live:live(),model:live()?DEFAULT_MODEL:'local-extractive',privacy:'documents remain client-side; only retrieved passages are accepted by POST'});
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  if(!live()) return res.status(503).json({error:'Live provider is not configured; use the browser-local fallback.'});

  const body=req.body||{}; const task=String(body.task||'research'); const question=String(body.question||'').trim().slice(0,5000); const mode=String(body.mode||'answer').slice(0,40); const evidence=safeEvidence(body.evidence);
  if(!question) return res.status(400).json({error:'Question is required'});
  if(!evidence.length && task!=='research') return res.status(400).json({error:'Evidence passages are required for studio outputs'});

  const evidenceText=evidence.length?`\nRetrieved evidence passages:\n${evidence.map(e=>`${e.id} | ${e.title}\n${e.text}`).join('\n\n')}`:'';
  const isArtifact=['summary','faq','study-guide','podcast'].includes(task);
  const instructions=isArtifact?artifactSchema(task):briefSchema();
  const useWeb=task==='research'&&!evidence.length;
  try{
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:DEFAULT_MODEL,tools:useWeb?[{type:'web_search'}]:[],input:[
        {role:'system',content:`You are the Research Ledger evidence engine. Produce inspectable, source-grounded research artifacts. Distinguish evidence from inference, expose uncertainty, and never fabricate support. ${instructions}`},
        {role:'user',content:`Task: ${task}\nMode: ${mode}\nQuestion: ${question}${evidenceText}`}
      ]})
    });
    const data=await response.json(); if(!response.ok) return res.status(response.status).json({error:data?.error?.message||`OpenAI request failed (${response.status})`});
    const parsed=parseJsonish(outputText(data)); if(!parsed) return res.status(502).json({error:'Model output was not valid JSON'});
    if(isArtifact){ parsed.type=task; parsed.citations=(parsed.citations||[]).filter(id=>evidence.some(e=>e.id===id)); return res.status(200).json({artifact:parsed,model:DEFAULT_MODEL}); }
    parsed.id=`brief_${Date.now()}`; parsed.generatedAt=new Date().toISOString(); parsed.model=DEFAULT_MODEL;
    const allowed=new Set(evidence.map(e=>e.id)); if(evidence.length){ parsed.claims=(parsed.claims||[]).map(c=>({...c,evidence:(c.evidence||[]).filter(id=>allowed.has(id))})); parsed.sources=evidence.map(e=>({id:e.id,title:e.title,url:'',kind:e.kind,perspective:'user-provided'})); }
    return res.status(200).json({brief:parsed,model:DEFAULT_MODEL});
  }catch(error){ return res.status(500).json({error:error.message||'Generation failed'}); }
}
