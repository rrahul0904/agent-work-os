const ACTIVE = new Set(['running','in_progress','working']);
const WAITING = new Set(['queued','pending','waiting','idle']);
const DONE = new Set(['completed','done','succeeded','success']);
const BLOCKED = new Set(['failed','error','blocked','cancelled','canceled']);

const ATTENTION_PATTERNS = [
  /approval/i,
  /permission/i,
  /confirm(?:ation)?/i,
  /waiting for/i,
  /blocked/i,
  /failed/i,
  /error/i
];

export function classifySession(session = {}) {
  const raw = String(session.status || 'unknown').toLowerCase();
  const attention = findAttention(session.events || []);
  if (BLOCKED.has(raw)) return { state: 'blocked', label: 'Blocked', raw, attention };
  if (DONE.has(raw)) return { state: 'done', label: 'Done', raw, attention };
  if (ACTIVE.has(raw) && attention?.severity === 'error') return { state: 'blocked', label: 'Blocked', raw, attention };
  if (ACTIVE.has(raw) && attention?.severity === 'approval') return { state: 'blocked', label: 'Needs approval', raw, attention };
  if (ACTIVE.has(raw)) return { state: 'working', label: 'Working', raw, attention };
  if (WAITING.has(raw)) return { state: 'waiting', label: raw === 'queued' ? 'Queued' : 'Waiting', raw, attention };
  if (attention?.severity === 'error') return { state: 'blocked', label: 'Blocked', raw, attention };
  return { state: 'waiting', label: raw === 'unknown' ? 'Unknown' : titleCase(raw), raw, attention };
}

export function findAttention(events = []) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i] || {};
    const haystack = eventText(event);
    if (!haystack) continue;
    if (event.kind === 'error' || /\b(failed|fatal|exception|error)\b/i.test(haystack)) {
      return { severity: 'error', reason: compact(haystack, 180), eventIndex: i };
    }
    if (/\b(approval|permission|confirm(?:ation)?)\b/i.test(haystack) && /\b(wait|need|required|request|ask|prompt)\w*\b/i.test(haystack)) {
      return { severity: 'approval', reason: compact(haystack, 180), eventIndex: i };
    }
    if (event.kind === 'status') return null;
  }
  return null;
}

export function summarizeRoom(sessions = []) {
  const counts = { working: 0, waiting: 0, blocked: 0, done: 0, total: sessions.length };
  for (const session of sessions) counts[classifySession(session).state] += 1;
  return counts;
}

export function sortSessions(sessions = []) {
  const priority = { blocked: 0, working: 1, waiting: 2, done: 3 };
  return [...sessions].sort((a, b) => {
    const pa = priority[classifySession(a).state];
    const pb = priority[classifySession(b).state];
    if (pa !== pb) return pa - pb;
    return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
  });
}

export function latestMeaningfulEvent(session = {}) {
  const events = session.events || [];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.kind === 'usage' || event?.kind === 'thread') continue;
    return { ...event, index: i };
  }
  return null;
}

export function eventPresentation(event = {}) {
  const kind = String(event.kind || 'event');
  if (kind === 'tool') {
    const phase = event.phase ? ` · ${event.phase}` : '';
    return { kind, title: `${event.name || 'tool'}${phase}`, body: readablePayload(event.payload), tone: toolTone(event) };
  }
  if (kind === 'text') return { kind, title: 'Agent response', body: String(event.text || ''), tone: 'normal' };
  if (kind === 'log') return { kind, title: `${event.stream || 'log'} output`, body: String(event.text || ''), tone: event.stream === 'stderr' ? 'danger' : 'terminal' };
  if (kind === 'error') return { kind, title: 'Error', body: String(event.message || 'Unknown error'), tone: 'danger' };
  if (kind === 'status') return { kind, title: `Status · ${event.status || 'unknown'}`, body: String(event.message || ''), tone: event.status === 'failed' ? 'danger' : 'normal' };
  return { kind, title: titleCase(kind), body: readablePayload(event), tone: 'normal' };
}

export function sessionLabel(session = {}) {
  const cwd = String(session.cwd || '');
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  const repo = parts.at(-1) || session.agent || 'agent';
  const shortId = String(session.id || '').slice(0, 6);
  return `${repo}${shortId ? ` · ${shortId}` : ''}`;
}

export function machineGroups(sessions = [], machines = []) {
  const byId = new Map(machines.map(machine => [machine.id, machine]));
  const grouped = new Map();
  for (const session of sessions) {
    const key = session.machineId || 'unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(session);
  }
  return [...grouped.entries()].map(([machineId, items]) => ({
    machineId,
    machine: byId.get(machineId) || { id: machineId, name: machineId === 'unknown' ? 'Unassigned' : machineId, status: 'unknown' },
    sessions: sortSessions(items)
  })).sort((a, b) => String(a.machine.name).localeCompare(String(b.machine.name)));
}

function eventText(event) {
  const pieces = [event.message, event.text, event.name, event.status, safeJson(event.payload)];
  return pieces.filter(Boolean).join(' ');
}

function toolTone(event) {
  const text = eventText(event);
  if (/\b(fail|error|exception)\b/i.test(text)) return 'danger';
  if (/\b(test|spec|lint|check)\b/i.test(text)) return 'test';
  if (/\b(diff|patch|edit|write|file)\b/i.test(text)) return 'diff';
  return 'terminal';
}

function readablePayload(payload) {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  try { return JSON.stringify(payload, null, 2); } catch { return String(payload); }
}

function safeJson(value) {
  try { return value == null ? '' : JSON.stringify(value); } catch { return ''; }
}

function compact(value, max) {
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function titleCase(value) {
  return String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export const attentionPatterns = ATTENTION_PATTERNS;
