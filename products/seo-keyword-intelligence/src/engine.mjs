const STOP = new Set([
  'a','an','and','are','as','at','be','best','by','for','from','how','i','in','is','it','of','on','or','the','to','vs','what','when','where','which','who','why','with','you','your'
]);

const COMMERCIAL = ['best','compare','comparison','alternative','alternatives','review','reviews','pricing','price','cost','cheap','top','software','tool','tools'];
const TRANSACTIONAL = ['buy','order','download','hire','book','subscribe','signup','sign-up','trial','coupon','deal','near me'];
const NAVIGATIONAL = ['login','sign in','signin','dashboard','support','docs','documentation','website','official'];
const INFORMATIONAL = ['how','what','why','when','where','guide','tutorial','requirements','setup','install','installation','example','examples','learn'];

export function normalizeKeyword(value = '') {
  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[“”‘’]/g, "'")
    .replace(/[^\p{L}\p{N}' -]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stemToken(token) {
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 5 && token.endsWith('ed')) return token.slice(0, -2);
  return token;
}

function words(value) {
  return normalizeKeyword(value).split(/[\s-]+/).filter(Boolean).map(stemToken);
}

function contentWords(value) {
  return words(value).filter((word) => !STOP.has(word));
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function jaccard(a, b) {
  const left = new Set(contentWords(a));
  const right = new Set(contentWords(b));
  if (!left.size && !right.size) return 1;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

export function inferIntent(keyword, supplied = 'unknown') {
  const normalizedSupplied = normalizeKeyword(supplied).replace(/ /g, '');
  if (['informational','commercial','transactional','navigational'].includes(normalizedSupplied)) return normalizedSupplied;

  const text = ` ${normalizeKeyword(keyword)} `;
  const contains = (values) => values.some((value) => text.includes(` ${value} `) || text.includes(value));
  if (contains(TRANSACTIONAL)) return 'transactional';
  if (contains(COMMERCIAL)) return 'commercial';
  if (contains(NAVIGATIONAL)) return 'navigational';
  if (contains(INFORMATIONAL)) return 'informational';
  return 'unknown';
}

function choosePageType(keyword, intent) {
  const text = normalizeKeyword(keyword);
  if (intent === 'transactional') return 'landing-page';
  if (intent === 'commercial') {
    if (/\b(vs|compare|comparison|alternative|alternatives)\b/.test(text)) return 'comparison-page';
    return 'commercial-article';
  }
  if (intent === 'navigational') return 'no-page';
  if (/\b(pricing|price|cost)\b/.test(text)) return 'commercial-article';
  return 'informational-article';
}

function completeness(item) {
  const fields = ['volume','difficulty','cpc','competition'];
  return fields.filter((field) => item[field] !== null).length / fields.length;
}

function opportunityScore(item) {
  const volume = item.volume ?? 0;
  const difficulty = item.difficulty ?? 50;
  const cpc = item.cpc ?? 0;
  const sourceSignal = clamp(item.sources.length * 18, 0, 54);
  const volumeSignal = clamp(Math.log10(volume + 1) * 22, 0, 66);
  const easeSignal = clamp((100 - difficulty) * 0.30, 0, 30);
  const cpcSignal = clamp(Math.log10(cpc + 1) * 12, 0, 12);
  const intentSignal = item.intent === 'transactional' ? 12 : item.intent === 'commercial' ? 9 : item.intent === 'informational' ? 5 : 1;
  return Math.round(clamp(volumeSignal * 0.38 + easeSignal * 0.24 + cpcSignal * 0.10 + sourceSignal * 0.18 + intentSignal, 0, 100));
}

function confidenceScore(item) {
  const sourceCoverage = clamp(item.sources.length * 24, 0, 60);
  const metricCoverage = completeness(item) * 28;
  const aliasEvidence = clamp((item.aliases.length - 1) * 6, 0, 12);
  return Math.round(clamp(sourceCoverage + metricCoverage + aliasEvidence, 0, 100));
}

function aggregateExact(observations) {
  const map = new Map();
  for (const raw of observations) {
    const keyword = normalizeKeyword(raw.keyword);
    if (!keyword) continue;
    const source = normalizeKeyword(raw.source || 'manual') || 'manual';
    const record = map.get(keyword) || {
      keyword,
      aliases: new Set(),
      sources: new Set(),
      observations: [],
      volume: null,
      difficulty: null,
      cpc: null,
      competition: null,
      intentVotes: []
    };
    record.aliases.add(String(raw.keyword).trim());
    record.sources.add(source);
    record.observations.push(raw);
    for (const field of ['volume','difficulty','cpc','competition']) {
      const value = numberOrNull(raw[field]);
      if (value !== null) record[field] = record[field] === null ? value : Math.max(record[field], value);
    }
    record.intentVotes.push(inferIntent(keyword, raw.intent));
    map.set(keyword, record);
  }
  return [...map.values()];
}

function dominantIntent(votes) {
  const counts = new Map();
  for (const vote of votes.filter((value) => value !== 'unknown')) counts.set(vote, (counts.get(vote) || 0) + 1);
  if (!counts.size) return 'unknown';
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

function mergeRecords(target, source) {
  for (const alias of source.aliases) target.aliases.add(alias);
  for (const provider of source.sources) target.sources.add(provider);
  target.observations.push(...source.observations);
  target.intentVotes.push(...source.intentVotes);
  for (const field of ['volume','difficulty','cpc','competition']) {
    const value = source[field];
    if (value !== null) target[field] = target[field] === null ? value : Math.max(target[field], value);
  }
}

function nearDeduplicate(records, threshold = 0.82) {
  const canonical = [];
  for (const record of records.sort((a, b) => a.keyword.localeCompare(b.keyword))) {
    const intent = dominantIntent(record.intentVotes);
    const match = canonical.find((candidate) => {
      const candidateIntent = dominantIntent(candidate.intentVotes);
      const intentCompatible = intent === 'unknown' || candidateIntent === 'unknown' || intent === candidateIntent;
      if (!intentCompatible) return false;
      const similarity = jaccard(record.keyword, candidate.keyword);
      const a = contentWords(record.keyword);
      const b = contentWords(candidate.keyword);
      const containment = a.every((token) => b.includes(token)) || b.every((token) => a.includes(token));
      return similarity >= threshold || (containment && Math.abs(a.length - b.length) <= 1);
    });
    if (match) mergeRecords(match, record);
    else canonical.push(record);
  }
  return canonical;
}

function clusterKey(item) {
  const tokens = [...new Set(contentWords(item.keyword))].sort();
  const topic = tokens.slice(0, 3).join('-') || 'general';
  return `${item.intent}:${topic}`;
}

export function analyzeObservations(observations, options = {}) {
  if (!Array.isArray(observations)) throw new TypeError('observations must be an array');
  const threshold = Number.isFinite(Number(options.nearDuplicateThreshold)) ? Number(options.nearDuplicateThreshold) : 0.82;
  const records = nearDeduplicate(aggregateExact(observations), threshold).map((record) => {
    const intent = dominantIntent(record.intentVotes) || inferIntent(record.keyword);
    const item = {
      keyword: record.keyword,
      aliases: [...record.aliases].sort(),
      sources: [...record.sources].sort(),
      sourceCount: record.sources.size,
      volume: record.volume,
      difficulty: record.difficulty,
      cpc: record.cpc,
      competition: record.competition,
      intent,
      pageType: choosePageType(record.keyword, intent),
      reviewState: 'needs-human-review',
      evidence: record.observations.length
    };
    item.opportunityScore = opportunityScore(item);
    item.confidenceScore = confidenceScore(item);
    item.clusterId = clusterKey(item);
    return item;
  });

  records.sort((a, b) => b.opportunityScore - a.opportunityScore || b.confidenceScore - a.confidenceScore || a.keyword.localeCompare(b.keyword));

  const clusters = new Map();
  for (const item of records) {
    const cluster = clusters.get(item.clusterId) || { id: item.clusterId, intent: item.intent, keywords: [], maxOpportunityScore: 0 };
    cluster.keywords.push(item.keyword);
    cluster.maxOpportunityScore = Math.max(cluster.maxOpportunityScore, item.opportunityScore);
    clusters.set(item.clusterId, cluster);
  }

  return {
    summary: {
      inputObservations: observations.length,
      canonicalOpportunities: records.length,
      clusterCount: clusters.size,
      providerCount: new Set(records.flatMap((item) => item.sources)).size
    },
    opportunities: records,
    clusters: [...clusters.values()].sort((a, b) => b.maxOpportunityScore - a.maxOpportunityScore || a.id.localeCompare(b.id))
  };
}

async function readStdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = JSON.parse(await readStdin());
  const observations = Array.isArray(input) ? input : input.observations;
  const result = analyzeObservations(observations, input.options || {});
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
