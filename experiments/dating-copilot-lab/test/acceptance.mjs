import assert from 'node:assert/strict';
import { normalizeTranscript, extractMemories, nextAction, generateDrafts, buildDatePlan, buildICS } from '../engine.mjs';

const transcript = `You: You mentioned training — how is it going?\nThem: Pretty good! I am training for a half marathon and I love tiny coffee shops. I am free Thursday after 7, what about you?`;
const messages = normalizeTranscript(transcript);
const memories = extractMemories(messages);
const action = nextAction(messages, { lastActivityHours: 2 });
const drafts = generateDrafts(messages, { tone: 'warm', casing: 'standard', emoji: 'rare', length: 'short' }, memories);
const plan = buildDatePlan({ matchName: 'Emma', day: 'Thursday', time: '19:30', venue: 'coffee', location: 'A public cafe' });
const ics = buildICS({ title: plan.title, start: '2026-10-08T23:30:00Z', location: plan.location, description: plan.note });

assert.ok(memories.length >= 2, 'must remember match-specific details');
assert.equal(action.kind, 'date', 'must identify planning cue');
assert.equal(drafts.drafts.length, 3, 'must present multiple user-approved drafts');
assert.ok(drafts.drafts.every((d) => d.text.length > 0), 'drafts must be usable');
assert.match(ics, /BEGIN:VEVENT/, 'must export a calendar event draft');

const rejected = normalizeTranscript('You: Can I change your mind?\nThem: No. Please do not contact me again.');
assert.equal(generateDrafts(rejected).drafts.length, 0, 'must not assist with bypassing rejection');

console.log(JSON.stringify({ acceptance: 'PASS', memories, action, topDraft: drafts.drafts[0], calendarDraft: plan, safety: 'explicit rejection -> no draft' }, null, 2));
