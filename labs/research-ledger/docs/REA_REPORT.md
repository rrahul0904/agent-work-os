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
| Deterministic local retrieval | Implemented |
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
| Private-network/SSRF refusal | Implemented with URL + DNS validation and redirect re-validation |
| Large automated test matrix | Improved API/security smoke + repository CI; full Playwright capacity matrix remains a separate hardening lane |
| ML embedding model | Not falsely claimed; current retrieval remains deterministic lexical/hybrid relevance |

## v0.3 completion work
- Captured sources now persist durably in IndexedDB and restore on reload.
- Research runs can save durable snapshots with evidence hashes.
- Snapshot history supports diff and replay without rewriting the evidence store.
- Portable contract export/import carries documents, captures, snapshots and the active brief.
- PDF-derived passages expose page markers in the passage UI.
- Captured URLs can be freshness-checked through `/api/source-status`.
- Freshness requests refuse credential-bearing/local/private destinations, validate DNS answers, revalidate redirects, cap sampled bytes and time out.
- Portable Node runtime exposes `/health`, `/api/research` and `/api/source-status` and adds a restrictive CSP.

## Honest non-goals
A true multilingual neural embedding model and encoded podcast-audio renderer are not necessary to call the owned research workflow complete and are not represented as implemented. Adding either would introduce a separate model/runtime dependency and must be benchmarked/gated independently rather than hidden behind a parity claim.

## Release gate
Implementation completion and production deployment remain separate. Code is complete only when `npm run check` and repository CI pass on the exact canonical SHA. Shipping still requires a live exact-SHA preview with `/`, `/health`, `/api/research` and `/api/source-status` verification; platform quota/account blockers remain external release gates.
