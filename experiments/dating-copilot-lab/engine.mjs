const BOUNDARY_PATTERNS = [
  /\bnot interested\b/i,
  /\bleave me alone\b/i,
  /\b(?:don['’]?t|do not) (?:text|message|contact) me\b/i,
  /\bstop (?:texting|messaging|contacting) me\b/i,
  /\bno means no\b/i,
];

const MINOR_PATTERNS = [
  /\bi(?:'m| am) (?:1[0-7])\b/i,
  /\bi(?:'m| am) a minor\b/i,
  /\bunder ?18\b/i,
  /\bunderage\b/i,
];

export function normalizeTranscript(input = '') {
  return String(input).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = line.match(/^(you|me|them|match|her|him|they)\s*:\s*(.+)$/i);
    if (!match) return { speaker: 'unknown', text: line };
    const raw = match[1].toLowerCase();
    return { speaker: raw === 'you' || raw === 'me' ? 'you' : 'them', text: match[2].trim() };
  });
}

export function detectSafetyBoundary(messages) {
  const all = messages.map((m) => m.text).join('\n');
  if (MINOR_PATTERNS.some((p) => p.test(all))) return { blocked: true, code: 'minor', reason: 'This prototype does not assist with conversations involving minors.' };
  const lastThem = [...messages].reverse().find((m) => m.speaker === 'them');
  if (lastThem && BOUNDARY_PATTERNS.some((p) => p.test(lastThem.text))) return { blocked: true, code: 'boundary', reason: 'The other person set a boundary. Do not send another dating message.' };
  return { blocked: false, code: null, reason: null };
}

export function extractMemories(messages) {
  const them = messages.filter((m) => m.speaker === 'them').map((m) => m.text);
  const memories = [], seen = new Set();
  const patterns = [
    { re: /\b(?:i\s+)?(?:love|like|adore)\s+([^.!?]{2,40})/i, prefix: 'Likes ' },
    { re: /\btraining for\s+([^.!?]{2,40})/i, prefix: 'Training for ' },
    { re: /\bfree\s+((?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)[^.!?]{0,24})/i, prefix: 'Free ' },
    { re: /\bbirthday(?:\s+is)?\s+([^.!?]{2,24})/i, prefix: 'Birthday ' },
    { re: /\ballergic to\s+([^.!?]{2,32})/i, prefix: 'Allergic to ' },
    { re: /\b(?:work|working) (?:as|in|at)\s+([^.!?]{2,40})/i, prefix: 'Work: ' },
  ];
  for (const text of them) for (const { re, prefix } of patterns) {
    const match = text.match(re); if (!match) continue;
    const memory = `${prefix}${match[1].trim().replace(/\s+/g, ' ')}`;
    const key = memory.toLowerCase(); if (!seen.has(key)) { seen.add(key); memories.push(memory); }
  }
  return memories.slice(0, 8);
}

function topicFrom(text = '') {
  const cleaned = text.replace(/https?:\/\/\S+/g, '').replace(/[^a-z0-9'’ ]/gi, ' ').replace(/\b(?:i|you|we|they|he|she|it|the|a|an|and|or|but|to|of|for|in|on|at|is|are|was|were|am|do|did|does|this|that|my|your|our|me)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.split(' ').filter(Boolean).slice(0, 5).join(' ') || 'that';
}

function applyStyle(text, style = {}) {
  let out = text.trim();
  const { casing = 'standard', tone = 'warm', emoji = 'rare', length = 'short' } = style;
  if (tone === 'direct') out = out.replace(/^(okay[, ]+|honestly[, ]+|haha[, ]+)/i, '');
  if (tone === 'lowkey') out = out.replace(/!+/g, '.');
  if (tone === 'playful' && !/[!?]$/.test(out)) out += '?';
  if (length === 'short' && out.length > 115) out = `${out.slice(0, 111).replace(/\s+\S*$/, '')}…`;
  if (emoji === 'sometimes' && !/[😀-🙏]/u.test(out)) out += ' 🙂';
  if (emoji === 'often' && !/[😀-🙏]/u.test(out)) out += ' 😄';
  if (casing === 'lower') out = out.toLowerCase();
  return out;
}

function reciprocalSignals(messages) {
  let score = 0;
  for (const m of messages.filter((m) => m.speaker === 'them').slice(-4)) {
    if (/\?/.test(m.text)) score += 1;
    if (m.text.length >= 40) score += 1;
    if (/\b(?:free|thursday|friday|saturday|sunday|coffee|drink|dinner|meet|weekend)\b/i.test(m.text)) score += 1;
  }
  return score;
}

export function nextAction(messages, { lastActivityHours = 0 } = {}) {
  const safety = detectSafetyBoundary(messages);
  if (safety.blocked) return { kind: 'stop', label: 'No action', rationale: safety.reason, urgency: 0 };
  if (!messages.length) return { kind: 'context', label: 'Add context', rationale: 'Add a real conversation before drafting.', urgency: 0 };
  const last = messages[messages.length - 1], reciprocity = reciprocalSignals(messages);
  if (last.speaker === 'you') return lastActivityHours >= 72 ? { kind: 'wait', label: 'Let it rest', rationale: 'You sent the last message and it has been quiet. Avoid piling on.', urgency: 0 } : { kind: 'wait', label: 'Wait', rationale: 'You sent the last message. Give them room to reply.', urgency: 0 };
  if (reciprocity >= 3 && /\b(?:free|thursday|friday|saturday|sunday|weekend|coffee|drink|dinner|meet)\b/i.test(last.text)) return { kind: 'date', label: 'Move toward a date', rationale: 'They are engaging and the latest message contains a planning cue.', urgency: 3 };
  if (lastActivityHours >= 24) return { kind: 'reply', label: 'Reply next', rationale: 'It is your turn and the thread has been waiting.', urgency: 2 };
  return { kind: 'reply', label: 'Reply', rationale: 'They sent the latest message. Keep the thread moving naturally.', urgency: 1 };
}

export function generateDrafts(messages, style = {}, memories = []) {
  const safety = detectSafetyBoundary(messages);
  if (safety.blocked) return { blocked: true, reason: safety.reason, drafts: [] };
  const lastThem = [...messages].reverse().find((m) => m.speaker === 'them');
  if (!lastThem) return { blocked: false, reason: null, drafts: [] };
  const topic = topicFrom(lastThem.text);
  const memory = memories[0]?.replace(/^(Likes |Training for |Free |Birthday |Allergic to |Work: )/i, '') || '';
  const action = nextAction(messages);
  const raw = action.kind === 'date' ? [
    'That sounds good. Want to continue this over coffee this week?',
    'I’m into that. Are you free Thursday evening for a drink?',
    'We’ve got enough material for an in-person debate. Coffee or a drink this week?',
  ] : [
    `Okay, ${topic} — tell me more. What got you into it?`,
    memory ? `Wait, that connects to ${memory}. How’s that going?` : 'That made me curious — what’s the story there?',
    'I like that answer. Give me the version you’d tell a friend over coffee?',
  ];
  const drafts = raw.map((text, index) => {
    const styled = applyStyle(text, style); let score = 0.66 - index * 0.03;
    if (styled.toLowerCase().includes(topic.split(' ')[0]?.toLowerCase())) score += 0.09;
    if (memory && styled.toLowerCase().includes(memory.split(' ')[0]?.toLowerCase())) score += 0.06;
    if (styled.length <= 120) score += 0.05;
    return { id: `draft-${index + 1}`, text: styled, score: Math.min(0.95, Number(score.toFixed(2))), why: index === 0 ? 'Uses the current topic and leaves an easy response path.' : index === 1 ? 'Uses remembered context when available.' : 'Keeps the tone light while moving the conversation forward.' };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { blocked: false, reason: null, drafts };
}

export function buildDatePlan({ matchName = 'Date', day = 'Thursday', time = '19:00', durationMinutes = 90, venue = 'coffee or drinks', location = '' } = {}) {
  return { title: `Date with ${matchName}`, day, time, durationMinutes, venue, location, note: `Draft plan: ${venue}${location ? ` at ${location}` : ''}. Confirm with the other person before adding or changing calendar events.` };
}
function toICSDate(date) { return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
export function buildICS({ title, start, durationMinutes = 90, location = '', description = '' }) {
  const startDate = new Date(start); if (Number.isNaN(startDate.getTime())) throw new Error('Invalid date');
  const endDate = new Date(startDate.getTime() + durationMinutes * 60_000);
  const escape = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Dating Copilot Lab//EN','BEGIN:VEVENT',`UID:${Date.now()}@dating-copilot-lab`,`DTSTAMP:${toICSDate(new Date())}`,`DTSTART:${toICSDate(startDate)}`,`DTEND:${toICSDate(endDate)}`,`SUMMARY:${escape(title)}`,`LOCATION:${escape(location)}`,`DESCRIPTION:${escape(description)}`,'END:VEVENT','END:VCALENDAR'].join('\r\n');
}
