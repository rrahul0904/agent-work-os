import test from "node:test";
import assert from "node:assert/strict";
import { prepareAssistantRequest } from "./spoiler-boundary.mjs";

const book = () => ({
  id: "public-domain-fixture", revision: "rev1",
  spine: [
    { paragraphs: ["Alice met Rowan.", "They found a map."] },
    { paragraphs: ["Rowan says hello. Then laughs.", "SECRET_FUTURE_CHAPTER_CHARACTER_DIES"] },
    { paragraphs: ["SECRET_FUTURE_CHAPTER_THE_TWIST"] }
  ]
});
const cursor = () => ({ bookRevision: "rev1", chapterIndex: 1, paragraphIndex: 0, utf16Offset: 17 });
const run = (changes = {}) => prepareAssistantRequest({
  book: book(), cursor: cursor(), action: "catch_me_up", enabled: true, ...changes
});
const allText = req => JSON.stringify(req);

test("cuts at the precise current paragraph UTF-16 boundary", () => {
  const request = run();
  assert.match(allText(request), /Rowan says hello/);
  assert.doesNotMatch(allText(request), /Then laughs/);
  assert.doesNotMatch(allText(request), /SECRET_FUTURE/);
  assert.equal(request.cursor.utf16Offset, 17);
});
test("does not read future paragraph or chapter getters", () => {
  const b = book();
  Object.defineProperty(b.spine[1].paragraphs, "1", { get() { throw Error("unread paragraph accessed"); } });
  Object.defineProperty(b.spine, "2", { get() { throw Error("unread chapter accessed"); } });
  assert.doesNotThrow(() => run({ book: b }));
});
test("who-is-this uses selected text from an earlier paragraph", () => {
  const request = run({ action: "who_is_this", selection: {
    chapterIndex: 0, paragraphIndex: 0, startOffset: 0, endOffset: 5
  }});
  assert.equal(request.selectedText, "Alice");
});
test("explain rejects selected text beyond cursor", () => {
  assert.throws(() => run({ action: "explain", selection: {
    chapterIndex: 1, paragraphIndex: 0, startOffset: 18, endOffset: 22
  }}), /SPOILER_SCOPE_REJECTED/);
});
test("selection rejects paragraphs that are unread", () => {
  assert.throws(() => run({ action: "who_is_this", selection: {
    chapterIndex: 1, paragraphIndex: 1, startOffset: 0, endOffset: 4
  }}), /SPOILER_SCOPE_REJECTED/);
});
test("no AI call when user opts out", () => {
  assert.throws(() => run({ enabled: false }), /assistant disabled/);
});
test("rejects stale revision after book replacement/reflow", () => {
  assert.throws(() => run({ cursor: { ...cursor(), bookRevision: "other" } }), /stale/);
});
test("unknown action is rejected", () => {
  assert.throws(() => run({ action: "search_entire_book" }), /unknown action/);
});
test("selection is mandatory for explain", () => {
  assert.throws(() => run({ action: "explain" }), /selection required/);
});
test("catch up does not accept arbitrary selection", () => {
  assert.throws(() => run({ selection: {
    chapterIndex: 0, paragraphIndex: 0, startOffset: 0, endOffset: 4
  }}), /does not accept/);
});
test("tail-cap truncation preserves recent read text only", () => {
  const request = run({ maxChars: 7 });
  assert.equal(request.excerpts.map(x => x.text).join(""), " hello.");
  assert.equal(request.truncatedAtStart, true);
});
test("invalid cursor chapter and paragraph rejected", () => {
  assert.throws(() => run({ cursor: { ...cursor(), chapterIndex: 8 } }), /chapter index/);
  assert.throws(() => run({ cursor: { ...cursor(), paragraphIndex: 9 } }), /paragraph index/);
});
test("rejects a UTF-16 boundary splitting an emoji", () => {
  assert.throws(() => run({ book: {
    id: "emoji", revision: "v", spine: [{ paragraphs: ["A😀B"] }]
  }, cursor: { bookRevision: "v", chapterIndex: 0, paragraphIndex: 0, utf16Offset: 2 } }), /surrogate pair/);
});
test("small budget never emits a broken surrogate pair", () => {
  const request = run({ book: {
    id: "emoji", revision: "v", spine: [{ paragraphs: ["A😀B"] }]
  }, cursor: { bookRevision: "v", chapterIndex: 0, paragraphIndex: 0, utf16Offset: 4 }, maxChars: 2 });
  assert.equal(request.excerpts.map(x => x.text).join(""), "B");
});
test("output is local-only and excludes the full source book object", () => {
  const request = run();
  assert.equal(request.execution, "local_only");
  assert.equal(Object.hasOwn(request, "book"), false);
  assert.equal(Object.hasOwn(request, "spine"), false);
});
