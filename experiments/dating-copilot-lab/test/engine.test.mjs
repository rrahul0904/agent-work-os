import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTranscript, detectSafetyBoundary, extractMemories, nextAction, generateDrafts, buildICS } from '../engine.mjs';

test('normalizes speaker labels', () => {
  const rows = normalizeTranscript('You: hey\nThem: hi there');
  assert.deepEqual(rows.map((r) => r.speaker), ['you', 'them']);
});

test('extracts useful match-specific memory', () => {
  const rows = normalizeTranscript('Them: I am training for a half marathon.\nThem: I am free Thursday after 7.');
  assert.ok(extractMemories(rows).some((m) => /half marathon/i.test(m)));
  assert.ok(extractMemories(rows).some((m) => /Thursday/i.test(m)));
});

test('respects explicit rejection and does not draft', () => {
  const rows = normalizeTranscript('You: another drink?\nThem: I am not interested, please leave me alone.');
  assert.equal(detectSafetyBoundary(rows).code, 'boundary');
  assert.equal(generateDrafts(rows).drafts.length, 0);
});

test('blocks conversations involving a minor', () => {
  const rows = normalizeTranscript("Them: I'm 17");
  assert.equal(detectSafetyBoundary(rows).code, 'minor');
});

test('recommends waiting when user sent last', () => {
  const rows = normalizeTranscript('Them: sounds fun\nYou: want to grab coffee?');
  assert.equal(nextAction(rows).kind, 'wait');
});

test('recommends moving toward a date on reciprocal planning cue', () => {
  const rows = normalizeTranscript('You: how was your run?\nThem: Great! I am free Thursday after 7, how about you?');
  assert.equal(nextAction(rows).kind, 'date');
});

test('draft ranking is deterministic and style-aware', () => {
  const rows = normalizeTranscript('You: what are you training for?\nThem: I am training for a half marathon and I love coffee. What about you?');
  const memories = extractMemories(rows);
  const a = generateDrafts(rows, { casing: 'lower', tone: 'lowkey', emoji: 'rare', length: 'short' }, memories);
  const b = generateDrafts(rows, { casing: 'lower', tone: 'lowkey', emoji: 'rare', length: 'short' }, memories);
  assert.deepEqual(a, b);
  assert.equal(a.drafts.length, 3);
  assert.equal(a.drafts[0].text, a.drafts[0].text.toLowerCase());
});

test('ICS builder emits a valid event envelope', () => {
  const ics = buildICS({ title: 'Date with Emma', start: '2026-10-08T23:00:00Z', location: 'Cafe' });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:Date with Emma/);
  assert.match(ics, /END:VCALENDAR/);
});
