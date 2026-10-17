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
| Experimental hybrid grounded-brief retrieval | Implemented with deterministic reciprocal-rank fusion and lexical fallback |
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
| Product-specific automated verification | Implemented with independent path-scoped `research-ledger-ci` plus API/schema/semantic/hybrid/runtime contracts |
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
- Exact semantic implementation head `a1b9b748eabb385bbefb527b85429e0690153297` passed independent product CI.

## Experimental hybrid brief retrieval
- Lexical remains the default brief retriever; users must explicitly choose **Hybrid RRF · experimental**.
- Hybrid mode requests a broader lexical and semantic candidate set, then combines rank positions using reciprocal-rank fusion with `k=60`, avoiding invalid direct comparison of lexical relevance scores and embedding cosine scores.
- The bridge reuses the existing Research Ledger brief-generation and rendering state rather than introducing a second brief model.
- The bridge reconciles persisted capture-derived semantic passage IDs back to current local passages before rendering; exact passage click-through remains available.
- Hybrid metadata records fusion mode, model/revision, semantic coverage, lexical/semantic overlap and whether a lexical fallback occurred.
- Any model download, worker, bridge or fusion failure degrades to deterministic lexical evidence selection and records the fallback in evidence gaps/lineage rather than aborting the research run.
- The keyboard shortcut is intercepted only when hybrid mode is selected; lexical mode delegates to the original app path unchanged.
- The portable runtime explicitly serves the hybrid bridge and the product-specific gate validates its classic-script integration seam.
- Exact hybrid implementation head `92292a5fedf416b1a6254eec25bbb96154873d54` passed `research-ledger-ci` run #24 with every verification step successful.

## Honest boundaries / next lanes
- Hybrid RRF is implemented but remains experimental. Automated contracts prove deterministic fusion and rollback behavior; they do not prove real-model retrieval-quality uplift.
- The next retrieval milestone is an empirical browser benchmark corpus covering paraphrases, multilingual questions, lexical-exact matches, semantic-only matches and adversarial/noise cases before considering hybrid as the default.
- The semantic index currently caps at 240 chunks and does not persist vectors across worker/browser restarts.
- Encoded podcast-audio export remains unimplemented.
- Full Playwright accessibility/capacity/browser-compatibility benchmarking remains a future hardening lane.
- Page-coordinate PDF highlighting remains an optional UX improvement beyond current page-marker provenance.

## Release gate
Implementation completion and production deployment remain separate. Product code is green only when the independent `research-ledger-ci` / `npm run check` gate passes on the exact canonical SHA. Parent Agent Work OS CI is tracked separately because unrelated root systems can fail independently. Shipping still requires a live exact-SHA preview with `/`, `/health`, `/api/research`, `/api/source-status` and browser-asset verification; platform quota/account blockers remain external release gates.
