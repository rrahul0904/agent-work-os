import assert from 'node:assert/strict';
import test from 'node:test';
import {createSyntheticWorld, normalizeSyntheticObservation, replaySyntheticObservations, deriveSyntheticCoPresence, VISION_OBSERVATION_VERSION, SYNTHETIC_GENERATOR} from '../src/index.js';

const base = {
  schemaVersion: VISION_OBSERVATION_VERSION,
  id: 'sim-event-001', source: 'synthetic', type: 'presence',
  occurredAt: '2026-10-14T12:00:00.000Z', cameraId: 'sim-cam-01', subjectId: 'sim-person-001',
  provenance: { generator: SYNTHETIC_GENERATOR, seed: 'test' }, box: [0.1, 0.2, 0.3, 0.4],
};
const obs = changes => normalizeSyntheticObservation({ ...base, ...changes });
test('only synthetic provenance enters the observation contract', () => {
  assert.throws(() => obs({ source: 'camera' }), /Only verifiable synthetic/);
  assert.throws(() => obs({ provenance: { generator: 'unknown', seed: 'test' } }), /Only verifiable synthetic/);
  assert.throws(() => obs({ subjectId: 'real-person' }), /synthetic ID/);
  assert.throws(() => obs({ schemaVersion: 'vision-observation/v2' }), /Unsupported/);
});
test('rejects ambiguous timestamps and invalid bounding boxes', () => {
  assert.throws(() => obs({ occurredAt: '2026-10-14' }), /exact UTC/);
  assert.throws(() => obs({ occurredAt: '2026-13-14T12:00:00.000Z' }), /exact UTC/);
  assert.throws(() => obs({ box: [0.5, 0.3, 0.1, 0.4] }), /normalized/);
  assert.throws(() => obs({ box: [0.1, 0.3, Infinity, 0.4] }), /normalized/);
});
test('normalization strips unexpected raw identity fields and freezes records', () => {
  const item = obs({ realName: 'Sensitive Name', photo: 'do-not-retain' });
  assert.equal(item.realName, undefined);
  assert.equal(item.photo, undefined);
  assert.ok(Object.isFrozen(item) && Object.isFrozen(item.provenance) && Object.isFrozen(item.box));
});
test('seeded world is stable, capped and entirely synthetic', () => {
  const options = { seed: 'stable', start: '2026-10-14T00:00:00.000Z', days: 7, people: 4, cameras: 2 };
  const a = createSyntheticWorld(options);
  assert.deepEqual(a, createSyntheticWorld(options));
  assert.equal(a.length, 7 * 4 * 3);
  assert.ok(a.every(x => x.source === 'synthetic' && x.subjectId.startsWith('sim-')));
  assert.notDeepEqual(a, createSyntheticWorld({ ...options, seed: 'other' }));
});
test('generation bounds deny unbounded workloads', () => {
  assert.throws(() => createSyntheticWorld({ people: 501 }), /people/);
  assert.throws(() => createSyntheticWorld({ cameras: 33 }), /cameras/);
  assert.throws(() => createSyntheticWorld({ days: 8 }), /days/);
});
test('replay filters future, range, subject and camera, with stable ordering', () => {
  const earlier = obs({ id: 'sim-event-002', occurredAt: '2026-10-14T11:00:00.000Z' });
  const future = obs({ id: 'sim-event-003', occurredAt: '2026-10-15T11:00:00.000Z' });
  const other = obs({ id: 'sim-event-004', cameraId: 'sim-cam-02' });
  const items = replaySyntheticObservations([future, other, earlier, obs({})], {
    at: '2026-10-14T12:00:00.000Z', from: '2026-10-14T11:30:00.000Z', cameraId: 'sim-cam-01', subjectId: 'sim-person-001',
  });
  assert.deepEqual(items.map(x => x.id), ['sim-event-001']);
});
test('replay rejects non-synthetic data even when it is timestamped', () => {
  assert.throws(() => replaySyntheticObservations([{ ...base, source: 'webcam' }], { at: base.occurredAt }), /Only verifiable/);
});
test('co-presence is reported as synthetic coincidence, not relationship', () => {
  const a = obs({});
  const b = obs({ id: 'sim-event-002', subjectId: 'sim-person-002', occurredAt: '2026-10-14T12:00:30.000Z' });
  const c = obs({ id: 'sim-event-003', subjectId: 'sim-person-003', occurredAt: '2026-10-14T12:05:00.000Z' });
  const edges = deriveSyntheticCoPresence([c, b, a]);
  assert.deepEqual(edges, [{ kind: 'simulated-co-presence', subjectA: 'sim-person-001', subjectB: 'sim-person-002', cameraId: 'sim-cam-01', count: 1 }]);
});
