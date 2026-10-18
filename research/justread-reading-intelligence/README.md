# JustRead 5.4 → RE-227 Reading Intelligence: REA research packet

- Intake date: 2026-10-18
- Governance: [Agent Work OS #282](https://github.com/rrahul0904/agent-work-os/issues/282)
- Original Reddit link: https://www.reddit.com/r/ebooks/s/nvMDAeLBya
- Resolved post: https://www.reddit.com/r/ebooks/comments/1x8xpcm/reading_assistant_for_justread_54_iphone_and_ipad/
- Vendor: https://justread.app/en/
- App Store: https://apps.apple.com/us/app/epub-reader-justread/id6757948605
- Classification: **DONOR/FEATURE PATTERN to RE-227 FreeReader Rebuild**; do not clone the vendor app or proliferate repositories.
- REA: governed evidence/acquisition (F23), then reconstruction packet (F24), never execution or shipping authority.
- Product owner: RE-227 FreeReader Rebuild. Research retained temporarily in Agent Work OS until an owned, verified canonical RE-227 product repository is available.
- Status: **public evidence captured; clean-room context boundary reference and fixture tests committed; no vendor binary analysis, no LLM integration, no real device acceptance, no ship**.

## Evidence ledger (claims are not verified behavior)

| Evidence | Classification | Observation / claim | Confidence / limitation |
| --- | --- | --- | --- |
| JR-001 | Creator-supplied Reddit post, 2026-10-18 | v5.4 Who's This? references earlier pages only; Catch Me Up at current progress; Explain selected passage; Apple Intelligence on-device; disable switch | **Claim**; no instrumented app/device test; first two said EPUB-only |
| JR-002 | Official justread.app vendor description | EPUB, PDF, comics, audiobook, cloud folder/Calibre/OPDS, TTS, sync, personal stats, typography | **Claim**; feature list not independently certified |
| JR-003 | Apple App Store listing | Distribution on iPhone/iPad, PETR JAHODA developer | App exists; timing/version UI could vary |
| JR-004 | Apple developer documentation | Foundation Models framework supports on-device system models; current framework also supports cloud/server models | **Documented platform API**, not proof JustRead's binary uses a particular invocation |
| JR-005 | Readest official docs/source | Competing cross-platform reader with EPUB/PDF, notes, local library, TTS, sync | Comparator; upstream app license AGPL-3.0, not permissive donor source |
| JR-006 | Readium Swift toolkit | Ebook/EPUB reader/navigation library, BSD-3-Clause | Potential dependency after pinned-commit dependency/license review |
| JR-007 | Internal RE-227 history | Existing FreeReader research lane, related Andrea Reader/ShelfReader and StorySprout/Lumabook references | Tracker and product repo must be reconciled, no phantom completion |
| JR-008 | Author's MobileRead 5.4 changelog (submitted 2026-10-15) | More granular explanation persistence, Catch Me Up after >=7 days and accessible in Book Details, *Highlights Digest* of highlights and notes, toggle in Settings > Reading | **Creator claim**, not observed app behavior; expands feature inventory beyond the original Reddit excerpt |

Sources:
- https://www.reddit.com/r/ebooks/comments/1x8xpcm/reading_assistant_for_justread_54_iphone_and_ipad/
- https://justread.app/en/
- https://apps.apple.com/us/app/epub-reader-justread/id6757948605
- https://developer.apple.com/foundation-models-framework/
- https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel/availability-swift.enum
- https://readest.com/docs
- https://github.com/readest/readest
- https://github.com/readium/swift-toolkit
- https://www.mobileread.com/forums/showthread.php?t=372480

No JustRead source license was established. Treat app code, UI artwork, commercial copy, assets and prompts as proprietary. Public facts, observed workflows, and independently written behavioral specifications are permitted research inputs. Never decompile or capture private user books without permission. Use licensed/public-domain fixtures for verification. Assess rights and DRM separately.

## Canonical product decision & differentiation

**Reader-first / local-first / cross-platform / book-owner controlled**: all reading/import/navigation, highlights/notes, reading history, sync, and optional local AI in a unified library. We want:
1. **Spoiler firewall** at a canonical reading locator, not a prompt-level honor policy.
2. **Reader memory**: bounded incremental recaps and entity ledger scoped to the confirmed reading progress, not unrestricted whole-book search.
3. **Explain and cite**: small explanations with source-backed citations and explicit uncertainty. Never pretend the book says something it doesn't. Vendor's v5.4 changelog says explanations persist per book; our design must specify opt-in retention, deletion and revision invalidation.
4. **Highlights Digest**: summarize highlights and notes, scoped to the current cursor by default. Old highlights from future chapters are an independent spoiler channel. 
5. **Privacy proof**: per-platform local inference availability, explicit opt-in, local-only permission; no cloud fallback without a separate opt-in/product policy.
6. **Multi-format core**: EPUB first; PDF, comics, audiobooks have different content/position proof models and must not be advertised as identical without certification.

Prior related mapping: RE-227 owns the reader; Andrea/ShelfReader is a library UX evidence source; StorySprout/Lumabook is immersive reading; RE-374 Chronicle Author Studio owns authoring/export, not this consumer-reader boundary; Life Library/HowFarIn is analytics/reference. Agent Work OS owns work planning, receipts, replay and governance, not the end-user reading UI.

## F24 reconstruction: trust boundaries

```text
Authorized EPUB import (sandbox; DRM rules) -> Readium/reader adapter
 -> spine-order text + stable revision digest + verified reading locator (EPUB CFI -> canonical span)
 -> SPOILER FIREWALL / source-context builder (this research implementation)
 -> local inference adapter (Apple on-device / independently verified local runtimes)
 -> factuality verifier + citations against strictly pre-cursor spans
 -> reader UI (Who's This? / Catch Me Up / Explain / opt-out)
     |
     +-> local-only cache keyed by book revision + cursor boundary + model version
             (encryption; retention/deletion; never promote future context)
```

**Important**: EPUB CFIs and UI page counts are not interchangeable. Reflow, custom fonts and device screens change pages. The shipping adapter MUST verify source revision, linear spine order and stable CFI/resolved DOM position before it calls `prepareAssistantRequest`. A mere integer from an untrusted UI is not proof of a reading position. CFI may point into nested elements, endnotes/footnotes or navigation. Detect and fail closed on unresolved, non-linear, reordered or external content.

**Adversarial exposure points**: full-book embeddings, a whole-book character map, global table-of-contents labels, metadata, image alt text, endnotes, prior cached responses, annotations/imported highlights from future chapters, cross-device stale cursor, prompts assembled from the entire EPUB, prior model session state. Each must be filtered by the same boundary, not post-filtered from responses.

**Reference module contract** (not a reader implementation):

```js
prepareAssistantRequest({
 book: {id, revision, spine: [{paragraphs: [normalizedPlaintext]}]},
 cursor: {bookRevision, chapterIndex, paragraphIndex, utf16Offset},
 action: "who_is_this" | "catch_me_up" | "explain",
 selection: {chapterIndex, paragraphIndex, startOffset, endOffset} | null,
 maxChars: 8192,
 enabled: true
}) -> {schema, execution:"local_only", cursor, selectedText, excerpts:[{chapterIndex, paragraphIndex, startOffset, endOffset, text}]}
```

Do NOT let untrusted external providers receive the source `book` object; only this filtered envelope can be passed to a verified local inference adapter. This helper deliberately does not perform model inference, EPUB parsing or iOS CFI translation. It checks UTF-16 offsets including surrogate boundaries and must be extended for grapheme-aware selections and richer EPUB semantics.

## Acceptance criteria and known limitations

| Gate | Acceptance condition | Current state |
| --- | --- | --- |
| A1 | No unread paragraph/chapter content read or forwarded by the context helper | Reference code + deterministic test fixtures |
| A2 | Mid-paragraph cursor, selection ahead of cursor and stale revision rejected | Reference code + deterministic test fixtures |
| A3 | Opt-out blocks request, no accidental cloud inference | Only helper opt-out implemented; network/runtime proof NOT DONE |
| A4 | EPUB import / CFI mapping / reflow / footnotes / nested TOC | NOT DONE |
| A5 | Who's This? entity resolution with evidence and no hallucinated entities | NOT DONE |
| A6 | Catch Me Up across long novels using prefix-safe digest ledger | NOT DONE |
| A7 | Explain with on-book local citations, model availability fallback | NOT DONE |
| A8 | Encrypted local cache, deletion, crash recovery and sync conflict policy | NOT DONE |
| A9 | iOS/iPadOS, macOS, Android, Windows, Web smoke/certification | NOT DONE |
| A10 | Independent device replay and receipts pinned to exact source SHA | NOT DONE |
| A11 | Copyright, DRM and dependency license audit | NOT DONE |
| A12 | Highlights Digest bounded to progress and filtered annotations | NOT DONE; identified from JR-008 |
| A13 | Persisted Explain answers must be source-scoped, encrypted/revision-keyed and deletable | NOT DONE; identified from JR-008 |

Run local reference tests:
```sh
node --test research/justread-reading-intelligence/spoiler-boundary.test.mjs
```

### Next bounded implementation slices

- **M1**: real EPUB locator-to-prefix adapter with public-domain hostile fixtures (nested TOC, footnotes, unicode, non-linear spine, CFI drift).
- **M2**: iOS/iPadOS local-only Apple Foundation Models adapter, availability/error/opt-out UX, raw-text network-deny verification. Apple has extended Foundation Models with server-compatible pathways; explicitly *select an on-device system model* and do not assume framework usage alone means content stays on-device.
- **M3**: character ledger, incremental catch-up memory, citations and output verifier. Use strict monotonic cursor/revision checkpoints and allow rewind without future ledger reuse.
- **M4**: actual RE-227 repo/product skeleton after canonical repo reconciliation; reader/import/bookmarks/sync UX and platform adapters.
- **M5**: adversarial replay, exact-SHA CI receipts, distribution-specific testing and licensing/commercial gate.

## Canonical App Inventory record

```yaml
intake: justread-5-4-reading-assistant
category: ebooks / reader / local AI
user_problem: resume a book and remember characters without spoilers or uploading book text
target_user: iPhone/iPad novel readers; expansion to cross-platform book owners
differentiation: spoiler-boundary attested local reader-memory and citations
source: https://www.reddit.com/r/ebooks/s/nvMDAeLBya
vendor: https://justread.app/en/
route: donor -> RE-227 FreeReader Rebuild
validation: creator claim + official site; independent user/binary/device validation pending
platform_strategy: portable context kernel + native UI/runtime adapters; Apple on-device first
platforms_targeted: [iOS, iPadOS, macOS, Android, Windows, Web]
flows: [import, shelf, reading, save-position, selection, character-help, catch-up, explain, highlights-digest, explanation-history, settings-opt-out, privacy, optional sync]
prd: initial F24 contract in this document
build_stack: normalized EPUB parser/Readium candidate, local-only model adapters, Agent Work OS gated execution
source_ownership: independent clean-room source; Readium BSD license review pending
commercial_model: undecided (do not inherit vendor pricing without validation)
product_repo: not verified; do not invent
agent_research_branch: research/justread-spoiler-safe-reading
agent_governance_issue: https://github.com/rrahul0904/agent-work-os/issues/282
status: RESEARCH_REFERENCE_COMMITTED
verification: initial deterministic tests only; no device/runtime/CI/certification receipts
```
