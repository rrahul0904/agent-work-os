# REA Clean-Room Reverse Engineering Report — Research Ledger v0.3

## Target and boundary
ResearchBench (`VikingOwl91/research-bench`), surfaced from the Oct. 16, 2026 r/SideProject target, is treated as a donor/reference for the existing Research Ledger / Learn Anything capability. The donor is AGPL-3.0-or-later. Agent Work OS does not copy donor source, prompts, CSS, assets or tests; public behavior and architecture are evidence only.

## Canonical ownership
REA owns evidence/provenance intake. Research Ledger owns the local source notebook, retrieval, citations, research artifacts, versions and drift. Learn Anything Studio may project learning-oriented outputs. Agent Work OS owns governed downstream execution and receipts.

## Capability status
| Capability | Owned v0.3 status |
|---|---|
| PDF/TXT/MD/CSV/HTML ingestion | Implemented |
| Browser-local persistence | Implemented |
| Deterministic lexical retrieval | Implemented; remains the default grounded-brief retriever |
| Multilingual neural semantic search | Implemented as an opt-in browser Web Worker lane with pinned E5 model/runtime |
| Semantic/lexical comparison | Implemented as top-result overlap diagnostic |
| Exact passage citations | Implemented |
| PDF page-marker provenance | Implemented; geometry highlighting remains optional future UX |
| Grounded Q&A / compare / recommend | Implemented |
| Summary / FAQ / study guide | Implemented |
| Two-host podcast transcript + local playback | Implemented |
| Downloadable rendered podcast audio | Not claimed; browser SpeechSynthesis has no portable encoded-audio export contract |
| BYO/provider generation | Implemented as bounded retrieved-passage synthesis |
| Durable snapshots / variants | Implemented, capped at 50 local snapshots |
| Replay + semantic change inspection | Implemented at brief/evidence-set level |
| Portable notebook import/export | Implemented as `research-ledger/notebook.v1` |
| Local evidence drift | Implemented with SHA-256 |
| Remote URL freshness | Implemented with explicit bounded public-URL checks |
| Private-network/SSRF refusal | Implemented with URL + DNS validation, pinned connection targets and redirect re-validation |
| Product-specific automated verification | Implemented with independent path-scoped `research-ledger-ci` plus API/schema/semantic/runtime contracts |
| Full Playwright/capacity matrix | Not claimed; remains a separate hardening lane |

## v0.3 completion work
- Captured sources persist durably in IndexedDB and restore on reload.
- Research runs can save durable snapshots with evidence hashes.
- Snapshot history supports diff and replay without rewriting the evidence store.
- Portable contract export/import carries documents, captures, snapshots and the active brief.
- PDF-derived passages expose page markers in the passage UI.
- Captured URLs can be freshness-checked through `/api/source-status`.
- Freshness requests refuse credential-bearing/local/private destinations, validate DNS answers, pin outbound connections to vetted addresses, revalidate redirects, cap sampled bytes and time out.
- Portable Node runtime exposes `/health`, `/api/research` and `/api/source-status` and applies a restrictive CSP.

## Multilingual semantic retrieval completion
- Semantic search is explicitly user-triggered; lexical search is always available as the no-model fallback.
- Browser inference uses `Xenova/multilingual-e5-small` at exact revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78` through Transformers.js `3.8.1`.
- Worker inference uses `q8`, normalized mean pooling and the E5 model's required `query:` / `passage:` retrieval prefixes.
- Notebook passages are loaded from local IndexedDB and transferred only to the same-origin Web Worker. The semantic controller does not send passage text to the application backend.
- The semantic index is capped at 240 chunks using deterministic round-robin source coverage so large notebooks do not silently overrepresent the earliest document.
- Semantic results preserve the existing exact passage IDs and can reopen the cited local passage.
- The UI reports semantic/lexical top-result overlap and whether semantic indexing covered the whole notebook.
- Model/runtime assets are downloaded only after explicit semantic use and can be cached by the browser; embedding vectors remain worker-memory state and are rebuilt when needed.
- Exact semantic implementation head `a1b9b748eabb385bbefb527b85429e0690153297` passed independent `research-ledger-ci` push run #3 and PR run #4.

## Honest boundaries / next lanes
- Semantic search is complete as an opt-in research inspection lane, but grounded brief generation still defaults to deterministic lexical retrieval. Promoting semantic/hybrid ranking into the brief generator requires a separate quality benchmark and rollback-safe integration rather than a parity claim.
- The semantic index currently caps at 240 chunks and does not persist vectors across worker/browser restarts.
- Encoded podcast-audio export remains unimplemented.
- Full Playwright accessibility/capacity/browser-compatibility benchmarking remains a future hardening lane.
- Page-coordinate PDF highlighting remains an optional UX improvement beyond current page-marker provenance.

## Release gate
Implementation completion and production deployment remain separate. Product code is green only when the independent `research-ledger-ci` / `npm run check` gate passes on the exact canonical SHA. Parent Agent Work OS CI is tracked separately because unrelated root systems can fail independently. Shipping still requires a live exact-SHA preview with `/`, `/health`, `/api/research`, `/api/source-status` and browser-asset verification; platform quota/account blockers remain external release gates.
