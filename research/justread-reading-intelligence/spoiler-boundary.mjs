// Clean-room portable context boundary; no EPUB parser or model adapter in this reference.
// Provenance: https://github.com/rrahul0904/agent-work-os/issues/282
// Input must already be normalized text in verified EPUB spine order.
// The only data passed to the inference provider is this returned request object.

function ensure(ok, message) {
  if (!ok) throw new Error(`SPOILER_SCOPE_REJECTED: ${message}`);
}

function validateUtf16Boundary(s, offset) {
  ensure(Number.isSafeInteger(offset) && offset >= 0 && offset <= s.length, "invalid UTF-16 offset");
  if (offset > 0 && offset < s.length) {
    const before = s.charCodeAt(offset - 1), after = s.charCodeAt(offset);
    ensure(!(before >= 0xD800 && before <= 0xDBFF && after >= 0xDC00 && after <= 0xDFFF), "offset splits surrogate pair");
  }
}

function prepareAssistantRequest({ book, cursor, action, selection = null, maxChars = 8192, enabled = false }) {
  // Security invariant: do not touch/bookmark/search/index any unread paragraph or chapter.
  ensure(enabled === true, "assistant disabled");
  ensure(["who_is_this", "catch_me_up", "explain"].includes(action), "unknown action");
  ensure(book && typeof book.id === "string" && typeof book.revision === "string" && Array.isArray(book.spine), "invalid book");
  ensure(cursor && cursor.bookRevision === book.revision, "stale or missing book revision");
  ensure(Number.isSafeInteger(maxChars) && maxChars > 0 && maxChars <= 100000, "invalid maxChars");
  const { chapterIndex, paragraphIndex, utf16Offset } = cursor;
  ensure(Number.isSafeInteger(chapterIndex) && chapterIndex >= 0 && chapterIndex < book.spine.length, "invalid chapter index");
  const currentChapter = book.spine[chapterIndex];
  ensure(currentChapter && Array.isArray(currentChapter.paragraphs), "invalid current chapter");
  ensure(Number.isSafeInteger(paragraphIndex) && paragraphIndex >= 0 && paragraphIndex < currentChapter.paragraphs.length, "invalid paragraph index");
  const currentText = currentChapter.paragraphs[paragraphIndex];
  ensure(typeof currentText === "string", "invalid current paragraph");
  validateUtf16Boundary(currentText, utf16Offset);
  let selectedText = null;
  if (action !== "catch_me_up") {
    ensure(selection !== null, "selection required");
    const { chapterIndex: sc, paragraphIndex: sp, startOffset: ss, endOffset: se } = selection;
    ensure(Number.isSafeInteger(sc) && Number.isSafeInteger(sp) && sc >= 0 && sc <= chapterIndex, "invalid selection chapter");
    const selectedChapter = book.spine[sc];
    ensure(selectedChapter && Array.isArray(selectedChapter.paragraphs) && sp >= 0 && sp < selectedChapter.paragraphs.length, "invalid selection paragraph");
    ensure(sc < chapterIndex || sp <= paragraphIndex, "selection after cursor");
    const selectedParagraph = selectedChapter.paragraphs[sp];
    ensure(typeof selectedParagraph === "string", "invalid selection text");
    validateUtf16Boundary(selectedParagraph, ss);
    validateUtf16Boundary(selectedParagraph, se);
    ensure(ss < se, "empty or reversed selection");
    ensure(sc < chapterIndex || sp < paragraphIndex || se <= utf16Offset, "selection crosses unread boundary");
    selectedText = selectedParagraph.slice(ss, se);
  } else {
    ensure(selection === null, "catch-up does not accept unrestricted selection");
  }
  const visible = [];
  for (let ci = 0; ci <= chapterIndex; ci++) {
    const paragraphs = book.spine[ci].paragraphs;
    ensure(Array.isArray(paragraphs), "invalid preceding chapter");
    const limit = ci === chapterIndex ? paragraphIndex : paragraphs.length - 1;
    for (let pi = 0; pi <= limit; pi++) {
      const paragraph = paragraphs[pi];
      ensure(typeof paragraph === "string", "invalid preceding paragraph");
      const endOffset = ci === chapterIndex && pi === paragraphIndex ? utf16Offset : paragraph.length;
      if (endOffset > 0) visible.push({ chapterIndex: ci, paragraphIndex: pi, startOffset: 0, endOffset, text: paragraph.slice(0, endOffset) });
    }
  }
  let remaining = maxChars;
  const window = [];
  for (let i = visible.length - 1; i >= 0 && remaining > 0; i--) {
    const c = visible[i], n = Math.min(c.text.length, remaining);
    let start = c.text.length - n;
    if (start > 0) {
      const low = c.text.charCodeAt(start), high = c.text.charCodeAt(start - 1);
      if (low >= 0xDC00 && low <= 0xDFFF && high >= 0xD800 && high <= 0xDBFF) start++;
    }
    if (start < c.text.length) {
      window.push({ chapterIndex: c.chapterIndex, paragraphIndex: c.paragraphIndex, startOffset: c.startOffset + start, endOffset: c.endOffset, text: c.text.slice(start) });
      remaining -= c.text.length - start;
    }
  }
  window.reverse();
  return {
    schema: "reader-assistant-request/v0.1",
    execution: "local_only",
    action,
    bookId: book.id,
    bookRevision: book.revision,
    cursor: { chapterIndex, paragraphIndex, utf16Offset },
    selectedText,
    excerpts: window,
    truncatedAtStart: visible.reduce((s,c)=>s+c.text.length,0) > maxChars
  };
}

export { prepareAssistantRequest };
