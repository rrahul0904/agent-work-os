export const SEMANTIC_MODEL_ID = 'Xenova/multilingual-e5-small';
export const SEMANTIC_MODEL_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
export const TRANSFORMERS_JS_VERSION = '3.8.1';
export const SEMANTIC_MAX_CHUNKS = 240;
export const SEMANTIC_CHUNK_CHARS = 1500;
export const SEMANTIC_CHUNK_OVERLAP = 220;
export const HYBRID_RRF_K = 60;

const STOP = new Set('a an the and or but if then than to of in on at by for from with without as is are was were be been being it its this that these those what which who whom how why when where can could should would may might will do does did have has had not no yes into about over under more most less least very also just their there they them we our you your i me my'.split(' '));

export function semanticTokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9À-ž]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1 && !STOP.has(token));
}

export function semanticChunkText(text, docId, title) {
  const clean = String(text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const out = [];
  let buffer = '';
  let ordinal = 1;
  const push = () => {
    const value = buffer.trim();
    if (value.length < 30) return;
    out.push({ id: `${docId}.C${ordinal++}`, docId, title, text: value });
    buffer = '';
  };
  for (const paragraph of paragraphs) {
    if (paragraph.length > 1800) {
      push();
      let start = 0;
      while (start < paragraph.length) {
        const end = Math.min(paragraph.length, start + SEMANTIC_CHUNK_CHARS);
        const piece = paragraph.slice(start, end);
        out.push({ id: `${docId}.C${ordinal++}`, docId, title, text: piece });
        if (end === paragraph.length) break;
        start = Math.max(start + (SEMANTIC_CHUNK_CHARS - SEMANTIC_CHUNK_OVERLAP), end - SEMANTIC_CHUNK_OVERLAP);
      }
      continue;
    }
    if ((buffer + '\n\n' + paragraph).length > SEMANTIC_CHUNK_CHARS) push();
    buffer += (buffer ? '\n\n' : '') + paragraph;
  }
  push();
  return out;
}

export function buildSemanticChunks(documents = [], captures = []) {
  const chunks = [];
  for (const doc of documents) chunks.push(...semanticChunkText(doc.text, doc.id, doc.name || doc.title || doc.id));
  for (const capture of captures) {
    if (!capture?.text) continue;
    chunks.push(...semanticChunkText(capture.text, capture.id, capture.title || capture.url || capture.id));
  }
  return chunks;
}

export function selectCoverageChunks(chunks, limit = SEMANTIC_MAX_CHUNKS) {
  if (chunks.length <= limit) return [...chunks];
  const groups = new Map();
  for (const chunk of chunks) {
    if (!groups.has(chunk.docId)) groups.set(chunk.docId, []);
    groups.get(chunk.docId).push(chunk);
  }
  const queues = [...groups.values()];
  const selected = [];
  let cursor = 0;
  while (selected.length < limit && queues.length) {
    const index = cursor % queues.length;
    const queue = queues[index];
    const next = queue.shift();
    if (next) selected.push(next);
    if (!queue.length) queues.splice(index, 1);
    else cursor += 1;
  }
  return selected;
}

export function lexicalRank(query, chunks, limit = 8) {
  const terms = semanticTokenize(query);
  if (!terms.length) return [];
  const ranked = chunks.map(chunk => {
    const tokens = semanticTokenize(chunk.text);
    const counts = new Map();
    for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
    let score = 0;
    for (const term of terms) {
      const tf = counts.get(term) || 0;
      if (tf) score += 1 + Math.log1p(tf) * 1.8;
      if (String(chunk.title || '').toLowerCase().includes(term)) score += 0.8;
    }
    const phrase = String(query || '').toLowerCase().trim();
    if (phrase.length > 5 && String(chunk.text || '').toLowerCase().includes(phrase)) score += 6;
    return { id: chunk.id, score: score / Math.sqrt(Math.max(tokens.length, 30)) };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

export function rankOverlap(first = [], second = [], limit = 8) {
  const a = new Set(first.slice(0, limit).map(item => item.id));
  const b = new Set(second.slice(0, limit).map(item => item.id));
  let overlap = 0;
  for (const id of a) if (b.has(id)) overlap += 1;
  return { overlap, limit: Math.min(limit, Math.max(a.size, b.size)) };
}

export function reciprocalRankFusion(rankings = [], limit = 8, k = HYBRID_RRF_K) {
  const fused = new Map();
  rankings.forEach((ranking, rankingIndex) => {
    const source = ranking?.name || `ranking-${rankingIndex + 1}`;
    const results = Array.isArray(ranking?.results) ? ranking.results : [];
    results.forEach((item, index) => {
      const id = String(item?.id || '');
      if (!id) return;
      const current = fused.get(id) || { id, score: 0, sources: [], ranks: {} };
      current.score += 1 / (k + index + 1);
      current.sources.push(source);
      current.ranks[source] = index + 1;
      fused.set(id, current);
    });
  });
  return [...fused.values()]
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, limit));
}
