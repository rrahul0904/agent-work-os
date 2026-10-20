/**
 * Governed synthetic vision observations: an intentionally camera-free, identity-free
 * first slice for the Agent Work OS Vision Perception Layer.
 *
 * Original clean-room implementation. Inspired by general event-replay patterns,
 * not copied from rosehahah/the-machine.
 */
export const VISION_OBSERVATION_VERSION = 'vision-observation/v1';
export const SYNTHETIC_GENERATOR = 'awos-synthetic-world/v1';
const ID_PATTERN = /^sim-[a-z0-9][a-z0-9-]{0,63}$/;
const TYPES = new Set(['presence', 'case-opened', 'case-closed', 'system']);
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function requireId(value, label, optional = false) {
  if (optional && value === null) return null;
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new TypeError(`${label} must be a synthetic ID`);
  return value;
}

function requireTime(value, label) {
  if (typeof value !== 'string' || !ISO_UTC.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new TypeError(`${label} must be an exact UTC ISO timestamp`);
  }
  return value;
}

/** Reject real-world camera/media/identity inputs rather than silently processing them. */
export function normalizeSyntheticObservation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Observation must be an object');
  if (raw.schemaVersion !== VISION_OBSERVATION_VERSION) throw new TypeError('Unsupported observation schema');
  if (raw.source !== 'synthetic' || raw.provenance?.generator !== SYNTHETIC_GENERATOR) {
    throw new TypeError('Only verifiable synthetic observations are allowed in this slice');
  }
  if (!TYPES.has(raw.type)) throw new TypeError('Unsupported observation type');
  const isSystem = raw.type === 'system';
  if (typeof raw.provenance.seed !== 'string' || raw.provenance.seed.length < 1 || raw.provenance.seed.length > 64) {
    throw new TypeError('Invalid generator seed');
  }
  const event = {
    schemaVersion: VISION_OBSERVATION_VERSION,
    id: requireId(raw.id, 'id'),
    source: 'synthetic',
    type: raw.type,
    occurredAt: requireTime(raw.occurredAt, 'occurredAt'),
    cameraId: requireId(raw.cameraId, 'cameraId', isSystem),
    subjectId: requireId(raw.subjectId, 'subjectId', isSystem),
    provenance: Object.freeze({ generator: SYNTHETIC_GENERATOR, seed: raw.provenance.seed }),
  };
  if (!isSystem && (event.cameraId === null || event.subjectId === null)) throw new TypeError('Non-system observations require camera and subject IDs');
  if (raw.box !== undefined) {
    if (!Array.isArray(raw.box) || raw.box.length !== 4 || !raw.box.every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1) || raw.box[0] >= raw.box[2] || raw.box[1] >= raw.box[3]) {
      throw new TypeError('box must be normalized [x1,y1,x2,y2]');
    }
    event.box = Object.freeze([...raw.box]);
  }
  return Object.freeze(event);
}

function randomGenerator(seed) {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** Synthetic observations only: no footage, face recognition, cameras or network access. */
export function createSyntheticWorld({ seed = 'the-machine-reference', start = '2026-10-14T00:00:00.000Z', days = 7, people = 50, cameras = 8 } = {}) {
  requireTime(start, 'start');
  if (typeof seed !== 'string' || seed.length < 1 || seed.length > 64) throw new TypeError('Invalid seed');
  if (!Number.isInteger(days) || days < 1 || days > 7) throw new RangeError('days must be 1..7');
  if (!Number.isInteger(people) || people < 1 || people > 500) throw new RangeError('people must be 1..500');
  if (!Number.isInteger(cameras) || cameras < 1 || cameras > 32) throw new RangeError('cameras must be 1..32');
  const rand = randomGenerator(seed);
  const events = [];
  const dayMs = 86400000;
  for (let day = 0; day < days; day++) {
    for (let person = 1; person <= people; person++) {
      // Three synthetic sightings per day; never real names or raw footage.
      for (let sighting = 0; sighting < 3; sighting++) {
        const minute = Math.floor(rand() * 1440);
        const camera = Math.floor(rand() * cameras) + 1;
        const x = rand() * 0.72;
        const y = rand() * 0.69;
        const event = normalizeSyntheticObservation({
          schemaVersion: VISION_OBSERVATION_VERSION,
          id: `sim-event-${String(day).padStart(2, '0')}-${String(person).padStart(3, '0')}-${sighting}`,
          source: 'synthetic', type: 'presence',
          occurredAt: new Date(Date.parse(start) + day * dayMs + minute * 60000).toISOString(),
          cameraId: `sim-cam-${String(camera).padStart(2, '0')}`,
          subjectId: `sim-person-${String(person).padStart(3, '0')}`,
          box: [x, y, Math.min(1, x + 0.15), Math.min(1, y + 0.25)],
          provenance: { generator: SYNTHETIC_GENERATOR, seed },
        });
        events.push(event);
      }
    }
  }
  return Object.freeze(events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)));
}

/** Replay is cutoff-bounded, deterministic, and never exposes future events. */
export function replaySyntheticObservations(events, { at, from, cameraId, subjectId } = {}) {
  requireTime(at, 'at');
  if (from !== undefined) requireTime(from, 'from');
  if (cameraId !== undefined) requireId(cameraId, 'cameraId');
  if (subjectId !== undefined) requireId(subjectId, 'subjectId');
  if (!Array.isArray(events) || events.length > 11000) throw new RangeError('Invalid event batch');
  return Object.freeze(events.map(normalizeSyntheticObservation)
    .filter(e => e.occurredAt <= at && (from === undefined || e.occurredAt >= from) &&
      (cameraId === undefined || e.cameraId === cameraId) && (subjectId === undefined || e.subjectId === subjectId))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)));
}

/** Co-presence is a simulated camera coincidence, never a claimed human relationship. */
export function deriveSyntheticCoPresence(events, { withinMs = 60000 } = {}) {
  if (!Number.isInteger(withinMs) || withinMs < 0 || withinMs > 300000) throw new RangeError('withinMs must be 0..300000');
  if (!Array.isArray(events) || events.length > 11000) throw new RangeError('Invalid event batch');
  const grouped = new Map();
  for (const raw of events) {
    const e = normalizeSyntheticObservation(raw);
    if (e.type !== 'presence') continue;
    if (!grouped.has(e.cameraId)) grouped.set(e.cameraId, []);
    grouped.get(e.cameraId).push(e);
  }
  const counts = new Map();
  for (const [cameraId, sightings] of grouped) {
    sightings.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
    for (let i = 0; i < sightings.length; i++) {
      for (let j = i + 1; j < sightings.length; j++) {
        const gap = Date.parse(sightings[j].occurredAt) - Date.parse(sightings[i].occurredAt);
        if (gap > withinMs) break;
        if (sightings[i].subjectId === sightings[j].subjectId) continue;
        const [a, b] = [sightings[i].subjectId, sightings[j].subjectId].sort();
        const key = `${a}|${b}|${cameraId}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  return Object.freeze([...counts].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => {
    const [subjectA, subjectB, cameraId] = key.split('|');
    return Object.freeze({ kind: 'simulated-co-presence', subjectA, subjectB, cameraId, count });
  }));
}
