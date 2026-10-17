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
| Deterministic lexical retrieval | Implemented; default grounded-brief mode |
| Multilingual neural semantic search | Implemented; opt-in browser Web Worker with pinned E5 model/runtime |
| Experimental semantic grounded briefs | Implemented with lexical fallback and retrieval lineage |
| Experimental hybrid grounded briefs | Implemented with deterministic RRF (`k=60`) and lexical fallback |
| Real-browser retrieval benchmark | Implemented; 20-case v2 receipt with overall/kind/language metrics |
| Exact passage citations | Implemented |
| PDF page-marker provenance | Implemented; geometry highlighting remains optional future UX |
| Grounded Q&A / compare / recommend | Implemented |
| Summary / FAQ / study guide | Implemented |
| Two-host podcast transcript + local playback | Implemented |
| Downloadable rendered podcast audio | Not claimed |
| BYO/provider generation | Implemented as bounded final-retrieved-passage synthesis |
| Durable snapshots / variants | Implemented, capped at 50 local snapshots |
| Replay + semantic change inspection | Implemented at brief/evidence-set level |
| Portable notebook import/export | Implemented as `research-ledger/notebook.v1` |
| Local evidence drift | Implemented with SHA-256 |
| Remote URL freshness | Implemented with explicit bounded public-URL checks |
| Private-network/SSRF refusal | Implemented with URL + DNS validation, pinned connection targets and redirect re-validation |
| Product-specific automated verification | Implemented with independent product CI plus real-browser benchmark CI |
| Full multi-browser/capacity matrix | Not claimed; remains a hardening lane |

## Multilingual semantic retrieval
- Browser inference uses `Xenova/multilingual-e5-small` at exact revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78` through Transformers.js `3.8.1`.
- Worker inference uses `q8`, normalized mean pooling and the E5 `query:` / `passage:` retrieval prefixes.
- Notebook passages are loaded from local IndexedDB and transferred only to the same-origin Web Worker.
- The semantic index is capped at 240 chunks using deterministic round-robin source coverage.
- Semantic results preserve exact passage IDs and can reopen the cited local passage.
- Model/runtime assets are downloaded only after explicit semantic/hybrid use and may be browser-cached; vectors remain worker-memory state and rebuild from local evidence.

## Grounded brief retrieval policy
Research Ledger now exposes three brief-retrieval choices:

1. **Lexical · default** — deterministic, zero model download, strong English/exact/noise performance and always available.
2. **Semantic · experimental** — pinned multilingual E5 ranking; records model revision/coverage and falls back to lexical if inference fails.
3. **Hybrid RRF · experimental** — fuses lexical and semantic rank positions with RRF `k=60`; records overlap/fusion metadata and falls back to lexical on failure.

The experimental bridge reuses the existing brief-generation/rendering state instead of creating a second brief system. Persisted capture-derived semantic IDs are reconciled to current exact local passages before rendering. Keyboard interception applies only to experimental modes; lexical delegates to the original path unchanged.

## Real-browser benchmark v2
The quality lane is no longer only contract-tested. A headless Chromium workflow downloads the exact pinned model and executes a fixed 20-case / 15-passage fixture across exact, paraphrase, multilingual, noise and adversarial queries.

Receipt:
- Schema: `research-ledger/retrieval-benchmark.v2`
- Exact head: `8a1c173342516fb3f37d74f75aded97f3cfe62d3`
- Workflow run: `38997319448`
- Job: `117292607265`
- Artifact: `12087960601`
- Digest: `sha256:40377640c90b782bdc8f2a088c31388332fe217311d05921cf347f2d898f55c1`

Overall:
- Lexical: Recall@5 **85.0%**, MRR **0.767**
- Semantic: Recall@5 **100.0%**, MRR **0.900**
- Hybrid: Recall@5 **100.0%**, MRR **0.867**

Multilingual subset (8 cases):
- Lexical: **62.5% / 0.479**
- Semantic: **100.0% / 0.875**
- Hybrid: **100.0% / 0.792**

English subset (12 cases):
- Lexical: **100.0% / 0.958**
- Semantic: **100.0% / 0.917**
- Hybrid: **100.0% / 0.917**

Interpretation:
- Semantic is the fixture leader overall and especially improves multilingual recall/ranking.
- Lexical remains excellent for English/exact/noise cases and avoids the model download/runtime cost.
- Equal-weight RRF protects recall but can allow lexical distractors to demote a correct semantic result, so hybrid trails semantic in MRR.
- The receipt explicitly records `promoteHybridDefault=false` and `promotionEligibleOnFixture=false`.
- No retrieval mode is auto-promoted from this curated fixture. See `docs/RETRIEVAL_BENCHMARK.md`.

## Runtime/security finding from the benchmark lane
The first cold Chromium benchmark surfaced a real inference-boundary issue: ONNX Runtime Web required WebAssembly compilation but the prior CSP did not permit it. Portable and Vercel CSPs now include scoped `'wasm-unsafe-eval'` while still refusing general JavaScript `'unsafe-eval'`. Runtime smoke tests enforce that distinction, and the real-model benchmark retriggers when server/CSP/model boundary files change.

## Verification model
- `research-ledger-ci` is the authoritative product-specific static/runtime/contract gate and runs `npm run check` independently from unrelated Agent Work OS tests.
- Contracts cover IndexedDB compatibility, API/security, semantic model pins/privacy, semantic/hybrid brief routing, RRF behavior, benchmark fixture/math and portable serving.
- `research-ledger-benchmark` is the semantic-quality regression gate for model/CSP/benchmark/inference-boundary changes and uploads a JSON receipt.
- Parent Agent Work OS CI remains useful but is not allowed to erase the product-specific signal when unrelated root systems fail.

## Honest boundaries / next lanes
- The 20-case benchmark is curated and small; single-case language rows are directional only.
- Lexical therefore remains the default even though semantic leads this fixture.
- Next retrieval work should evaluate representative real notebooks, cold/warm latency, indexing time, memory use and additional browsers/devices before changing the default.
- Weighted/tuned fusion should be evaluated independently rather than tuned to this fixture.
- The semantic index caps at 240 chunks and does not persist vectors across worker/browser restarts.
- Encoded podcast-audio export and page-coordinate PDF highlighting remain unimplemented.

## Release gate
Implementation completion and production deployment remain separate. Product code is green only when `research-ledger-ci` passes on the exact canonical SHA; semantic inference-boundary changes additionally require the real-browser benchmark gate. Shipping still requires a live exact-SHA preview with `/`, `/health`, `/api/research`, `/api/source-status` and referenced browser assets verified. Platform quota/account blockers remain external release gates.
