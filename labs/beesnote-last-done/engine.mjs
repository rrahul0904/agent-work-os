/** Beesnote Last-Done Engine. Original clean-room implementation; no DoneAgo code. */
export const VERSION = 1;
const DAY = 86_400_000;
function assert(test, message) { if (!test) throw new Error(message); }
function isoToMs(iso) {
  assert(typeof iso === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(iso), 'Timestamp must be UTC ISO 8601');
  const ms = Date.parse(iso);
  assert(Number.isFinite(ms), 'Invalid timestamp');
  return ms;
}
function duration(ms) { assert(Number.isSafeInteger(ms) && ms > 0, 'Duration must be positive integer milliseconds'); return ms; }
export function emptyStore() { return { version: VERSION, cards: [], events: [] }; }
export function addCard(store, card) {
  assert(store?.version === VERSION, 'Unsupported store schema');
  assert(typeof card?.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(card.id), 'Invalid card ID');
  assert(!store.cards.some(c => c.id === card.id), 'Card ID already exists');
  assert(typeof card.title === 'string' && card.title.trim().length > 0 && card.title.length <= 120, 'Invalid title');
  assert(Array.isArray(card.states) && card.states.length >= 1 && card.states.length <= 10, 'Expected 1–10 states');
  const ids = new Set();
  for (const s of card.states) {
    assert(typeof s.id === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(s.id) && !ids.has(s.id), 'Invalid or duplicate state ID');
    ids.add(s.id);
    assert(typeof s.label === 'string' && s.label.trim().length > 0 && s.label.length <= 60, 'Invalid state label');
    if (s.autoAfterMs !== undefined) duration(s.autoAfterMs);
  }
  for (const s of card.states) if (s.nextStateId !== undefined) {
    assert(ids.has(s.nextStateId) && s.nextStateId !== s.id, 'Invalid next state');
    assert(s.autoAfterMs !== undefined, 'Auto-advance requires a duration');
  }
  const completionStateId = card.completionStateId ?? card.states[0].id;
  assert(ids.has(completionStateId), 'Unknown completion state');
  if (card.targetIntervalMs !== undefined) duration(card.targetIntervalMs);
  const copy = { id:card.id, title:card.title.trim(), states:card.states.map(s => ({...s})), completionStateId };
  if (card.targetIntervalMs !== undefined) copy.targetIntervalMs = card.targetIntervalMs;
  return { ...store, cards:[...store.cards, copy] };
}
export function logEvent(store, event) {
  assert(store?.version === VERSION, 'Unsupported store schema');
  assert(typeof event?.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(event.id), 'Invalid event ID');
  const card = store.cards.find(c => c.id === event.cardId);
  assert(card, 'Unknown card');
  assert(card.states.some(s => s.id === event.stateId), 'Unknown state');
  isoToMs(event.at);
  assert(event.note === undefined || (typeof event.note === 'string' && event.note.length <= 2000), 'Invalid note');
  const normalized = { id:event.id, cardId:event.cardId, stateId:event.stateId, at:event.at, note:event.note ?? '' };
  const prior = store.events.find(e => e.id === event.id);
  if (prior) {
    assert(JSON.stringify(prior) === JSON.stringify(normalized), 'Conflicting duplicate event ID');
    return store; // stable idempotency under offline retries
  }
  return { ...store, events:[...store.events, normalized] };
}
function orderedEvents(store, cardId, asOf) {
  const cut = isoToMs(asOf);
  return store.events.filter(e => e.cardId === cardId && isoToMs(e.at) <= cut)
    .sort((a,b) => isoToMs(a.at)-isoToMs(b.at) || a.id.localeCompare(b.id));
}
/** Timed transitions are derived, not silently written to the event log. */
export function statusAt(store, cardId, asOf) {
  const card = store.cards.find(c => c.id === cardId);
  assert(card, 'Unknown card');
  const events = orderedEvents(store, cardId, asOf);
  if (!events.length) return { stateId:null, since:null, elapsedMs:null, origin:'never' };
  const last = events.at(-1);
  let stateId = last.stateId, since = last.at, origin = 'logged';
  const definition = card.states.find(s => s.id === stateId);
  if (definition.autoAfterMs && definition.nextStateId && isoToMs(asOf)-isoToMs(since) >= definition.autoAfterMs) {
    stateId = definition.nextStateId;
    since = new Date(isoToMs(since) + definition.autoAfterMs).toISOString();
    origin = 'derived-transition';
  }
  return { stateId, since, elapsedMs:isoToMs(asOf)-isoToMs(since), origin };
}
export function rhythmFor(store, cardId, asOf) {
  const card = store.cards.find(c => c.id === cardId);
  assert(card, 'Unknown card');
  const events = orderedEvents(store, cardId, asOf).filter(e => e.stateId === card.completionStateId);
  const timestamps = [...new Set(events.map(e => isoToMs(e.at)))];
  if (timestamps.length < 3) return { samples:timestamps.length, typicalIntervalMs:null, lastCompletedAt:events.at(-1)?.at ?? null };
  const gaps = timestamps.slice(1).map((ms,i)=>ms-timestamps[i]).filter(ms=>ms>0).sort((a,b)=>a-b);
  const mid=Math.floor(gaps.length/2);
  const median = gaps.length%2 ? gaps[mid] : Math.round((gaps[mid-1]+gaps[mid])/2);
  return { samples:timestamps.length, typicalIntervalMs:median, lastCompletedAt:events.at(-1)?.at ?? null };
}
/** This is informational, never a medical schedule or mandatory action. */
export function attentionAt(store, cardId, asOf) {
  const card = store.cards.find(c => c.id === cardId);
  assert(card, 'Unknown card');
  const stats=rhythmFor(store, cardId, asOf);
  const interval = card.targetIntervalMs ?? stats.typicalIntervalMs;
  if (!interval || !stats.lastCompletedAt) return {due:false, dueAt:null, basis:'insufficient-data'};
  const dueMs=isoToMs(stats.lastCompletedAt)+interval;
  return {due:isoToMs(asOf)>=dueMs, dueAt:new Date(dueMs).toISOString(), basis:card.targetIntervalMs?'explicit-target':'inferred-rhythm'};
}
export function chooseOneNudge(store, asOf, {lastNudgeUtcDay=null}={}) {
  const today=asOf.slice(0,10);
  if (lastNudgeUtcDay===today) return null;
  const due=store.cards.map(card=>({card, attention:attentionAt(store,card.id,asOf)}))
    .filter(x=>x.attention.due)
    .sort((a,b)=>a.attention.dueAt.localeCompare(b.attention.dueAt)||a.card.id.localeCompare(b.card.id));
  return due.length ? {cardId:due[0].card.id, dueAt:due[0].attention.dueAt, day:today} : null;
}
export function decodeStore(json) {
  const parsed=JSON.parse(json);
  assert(parsed?.version===VERSION && Array.isArray(parsed.cards) && Array.isArray(parsed.events), 'Unsupported import');
  let clean=emptyStore();
  for (const c of parsed.cards) clean=addCard(clean,c);
  for (const e of parsed.events) clean=logEvent(clean,e);
  return clean;
}
export const millisecondsPerDay=DAY;
