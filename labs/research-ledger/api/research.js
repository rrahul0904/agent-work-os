const MAX_EVIDENCE=10,MAX_CHARS=6000;
const live=()=>Boolean(process.env.OPENAI_API_KEY&&process.env.OPENAI_MODEL);
function textOf(data){if(typeof data.output_text==='string')return data.output_text;const out=[];for(const item of data.output||[])for(const part of item.content||[])if(part.type==='output_text'&&part.text)out.push(part.text);return out.join('\n')}
function jsonish(text){const s=String(text||'').trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();try{return JSON.parse(s)}catch{}const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a>=0&&b>a)try{return JSON.parse(s.slice(a,b+1))}catch{}return null}
function evidence(body){return(Array.isArray(body.evidence)?body.evidence:[]).slice(0,MAX_EVIDENCE).map((e,i)=>({id:String(e.id||`S${i+1}`).slice(0,80),title:String(e.title||'Source').slice(0,200),text:String(e.text||'').slice(0,MAX_CHARS),kind:String(e.kind||'local-passage').slice(0,80)})).filter(e=>e.text)}
async function ask(system,user){const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL,input:[{role:'system',content:system},{role:'user',content:user}]})});const d=await r.json();if(!r.ok)throw new Error(d?.error?.message||`Provider request failed (${r.status})`);return textOf(d)}
export default async function handler(req,res){
  if(req.method==='GET')return res.status(200).json({live:live(),model:live()?process.env.OPENAI_MODEL:null,mode:live()?'retrieval-plus-synthesis':'local-only'});
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!live())return res.status(503).json({error:'Live generation is not configured. Local browser research remains available.'});
  const body=req.body||{},task=String(body.task||'research'),question=String(body.question||'').trim().slice(0,4000),ev=evidence(body);
  if(!question)return res.status(400).json({error:'Question is required'});if(!ev.length)return res.status(400).json({error:'At least one retrieved evidence passage is required'});
  const block=ev.map(e=>`[${e.id}] ${e.title}\n${e.text}`).join('\n\n---\n\n');
  try{
    if(task==='research'){
      const shape='{"mode":"Evidence Brief|Comparison Brief|Recommendation Brief","title":"short title","status":"SUPPORTED|PROVISIONAL|INSUFFICIENT EVIDENCE","confidence":0.0,"overview":"direct grounded answer","claims":[{"id":"C1","text":"claim","evidence":["PASSAGE_ID"],"strength":"strong|medium|weak"}],"gaps":["gap"],"nextMoves":["next move"]}';
      const raw=await ask(`You are the Research Ledger synthesis layer. Use ONLY the supplied passages. Every substantive claim must cite one or more exact passage IDs from the evidence block. Do not invent support. Return ONLY valid JSON matching ${shape}.`, `Mode: ${String(body.mode||'answer')}\nQuestion: ${question}\n\nEvidence:\n${block}`);
      const brief=jsonish(raw);if(!brief)throw new Error('Provider returned invalid research JSON');return res.status(200).json({brief,model:process.env.OPENAI_MODEL});
    }
    const names={summary:'grounded summary',faq:'FAQ', 'study-guide':'study guide',podcast:'two-host podcast transcript'};const label=names[task]||'grounded research artifact';
    const raw=await ask(`Create a concise ${label}. Use ONLY the supplied passages. Cite exact passage IDs in square brackets, e.g. [DOC1.C2]. For podcast output alternate HOST A and HOST B. Never claim uncited facts.`, `Question/context: ${question}\n\nEvidence:\n${block}`);
    const ids=ev.filter(e=>raw.includes(`[${e.id}]`)).map(e=>e.id);return res.status(200).json({artifact:{type:task,title:label.replace(/\b\w/g,c=>c.toUpperCase()),content:raw,citations:ids},model:process.env.OPENAI_MODEL});
  }catch(error){return res.status(502).json({error:error.message||'Generation failed'})}
}
