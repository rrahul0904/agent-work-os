const DEFAULT_SOURCES = [
  { id: 'S1', title: 'Primary documentation', url: 'https://example.com/docs', kind: 'documentation', perspective: 'primary' },
  { id: 'S2', title: 'Independent field report', url: 'https://example.com/report', kind: 'independent', perspective: 'balanced' },
  { id: 'S3', title: 'Practitioner discussion', url: 'https://example.com/community', kind: 'community', perspective: 'experience-based' }
];

function demoBrief(question, mode, sources = []) {
  const all = sources.length ? sources.map((s, i) => ({ id:`S${i+1}`, title:s.title || s.url || `Source ${i+1}`, url:s.url || '#', kind:s.kind || 'captured', perspective:s.perspective || 'user-selected' })) : DEFAULT_SOURCES;
  const isDecision = mode === 'recommend' || /\b(should|choose|best|recommend|vs\.?|versus)\b/i.test(question);
  const recommendation = isDecision
    ? 'The current evidence supports a provisional direction, but the decision should remain reversible until the highest-impact evidence gap is closed.'
    : 'The evidence supports a clear working answer, with one material uncertainty that should stay attached to the conclusion.';
  return {
    id: `brief_${Date.now()}`,
    mode: isDecision ? 'Recommendation Brief' : mode === 'compare' ? 'Comparison Brief' : 'Evidence Brief',
    title: question.length > 72 ? question.slice(0, 69) + '…' : question,
    question,
    status: isDecision ? 'PROVISIONAL' : 'SUPPORTED WITH GAPS',
    confidence: isDecision ? 0.72 : 0.79,
    overview: recommendation,
    claims: [
      { id:'C1', text:'The strongest conclusion is supported by more than one evidence type rather than a single source.', evidence: all.slice(0,2).map(s=>s.id), strength:'strong' },
      { id:'C2', text:'A practical trade-off remains between speed of action and depth of verification.', evidence: all.slice(1,3).map(s=>s.id), strength:'medium' },
      { id:'C3', text:'The conclusion should be revisited when new evidence materially changes one of the deciding assumptions.', evidence:[all[0].id], strength:'medium' }
    ],
    gaps: [
      'No source in this run independently validates the most consequential downside.',
      'Freshness and source drift have not yet been rechecked after the initial capture.'
    ],
    nextMoves: [
      'Add one independent source focused on the largest downside.',
      'Run evidence recheck before turning this brief into an execution plan.'
    ],
    sources: all,
    lineage: [
      { stage:'Question', detail: question },
      { stage:'Evidence set', detail:`${all.length} source${all.length===1?'':'s'} captured or discovered` },
      { stage:'Claims', detail:'3 claims mapped to evidence IDs' },
      { stage:'Decision state', detail:isDecision ? 'Provisional recommendation' : 'Working answer with explicit gaps' }
    ],
    model: 'demo-local',
    generatedAt: new Date().toISOString()
  };
}

function extractOutputText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    if (item.type === 'message') {
      for (const part of item.content || []) {
        if (part.type === 'output_text' && part.text) chunks.push(part.text);
      }
    }
  }
  return chunks.join('\n');
}

function parseJsonish(text) {
  if (!text) return null;
  const cleaned = text.trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  try { return JSON.parse(cleaned); } catch {}
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(cleaned.slice(first, last + 1)); } catch {}
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body || {};
  const question = String(body.question || '').trim();
  const mode = String(body.mode || 'auto');
  const suppliedSources = Array.isArray(body.sources) ? body.sources.slice(0, 16) : [];
  if (!question) return res.status(400).json({ error: 'Question is required' });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(200).json({ demo: true, brief: demoBrief(question, mode, suppliedSources) });
  }

  const schemaInstruction = `Return ONLY valid JSON with this shape:\n{
    "mode":"Evidence Brief|Research Brief|Comparison Brief|Recommendation Brief",
    "title":"short title",
    "question":"original question",
    "status":"SUPPORTED|PROVISIONAL|INSUFFICIENT EVIDENCE",
    "confidence":0.0,
    "overview":"direct answer or recommendation",
    "claims":[{"id":"C1","text":"claim","evidence":["S1"],"strength":"strong|medium|weak"}],
    "gaps":["explicit evidence gap"],
    "nextMoves":["bounded next research move"],
    "sources":[{"id":"S1","title":"source title","url":"https://...","kind":"documentation|news|analysis|community|other","perspective":"primary|independent|vendor|community|other"}],
    "lineage":[{"stage":"Question|Evidence set|Claims|Decision state","detail":"..."}]
  }.\nEvery substantive claim must cite at least one source ID. AI-chat content, if supplied, is context and must not count as independent verification. Surface uncertainty rather than inventing support.`;

  const sourceContext = suppliedSources.length
    ? `\nUser-selected sources (use these first and preserve their URLs):\n${suppliedSources.map((s,i)=>`S${i+1}: ${s.title || ''} ${s.url || ''} ${s.text ? `\nExcerpt: ${String(s.text).slice(0,5000)}` : ''}`).join('\n')}`
    : '';

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-6-luna',
        tools: suppliedSources.length ? [] : [{ type: 'web_search' }],
        input: [
          { role: 'system', content: `You are the Research Ledger evidence engine. Build inspectable research artifacts, not conversational prose. ${schemaInstruction}` },
          { role: 'user', content: `Mode: ${mode}\nResearch question: ${question}${sourceContext}` }
        ]
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `OpenAI request failed (${response.status})`);
    const parsed = parseJsonish(extractOutputText(data));
    if (!parsed) throw new Error('Model response was not valid JSON');
    parsed.id = `brief_${Date.now()}`;
    parsed.generatedAt = new Date().toISOString();
    parsed.model = process.env.OPENAI_MODEL || 'gpt-6-luna';
    return res.status(200).json({ demo: false, brief: parsed });
  } catch (error) {
    const fallback = demoBrief(question, mode, suppliedSources);
    fallback.warning = error.message;
    return res.status(200).json({ demo: true, fallback: true, brief: fallback });
  }
}
