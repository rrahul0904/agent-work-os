# REA donor dossier: RuVector adaptive memory → Agent Work OS Memory Plane

**Date:** 2026-10-20 (America/New_York)  
**Governance:** [#325](https://github.com/rrahul0904/agent-work-os/issues/325)  
**Canonical owner:** [#166 Memory Plane](https://github.com/rrahul0904/agent-work-os/issues/166)  
**Stage:** RESEARCH / SPECIFIED / BLOCKED_WIP — not implemented, merged, independently benchmarked or shipped  
**Source:** https://www.reddit.com/r/aiagents/s/rrGakXKrPn  
**Resolved post:** https://www.reddit.com/r/aiagents/comments/1xasz2w/adaptive_memory_open_source/  
**Upstream:** https://github.com/ruvnet/RuVector  
**Exact inspected snapshot:** [46d816ddc4c2a8a06cd3613534a79b1d557d858b](https://github.com/ruvnet/RuVector/tree/46d816ddc4c2a8a06cd3613534a79b1d557d858b)

## 1. Source, identity, confidence

The r/aiagents post by u/Motor_System_6171 is titled "Adaptive memory, Open Source" and links directly to RuVector. It describes an Explorer for search paths, query memory, adaptive search settings and the quality/effort trade-off, explicitly saying the browser demo does not retrain a foundation model. The actual underlying open-source repository is ruvnet/RuVector, not a proprietary SaaS clone. The linked Cognitum enterprise offering is a different commercial boundary.

Evidence grades here:
- **OBSERVED-SOURCE:** Reddit text, GitHub repository and checked-in code or docs at the exact SHA.
- **UPSTREAM-CLAIM:** implementation or benchmark performance described by maintainers, not reproduced here.
- **INFERRED-DESIGN:** integration decisions proposed for Agent Work OS.
- **UNKNOWN:** performance, reliability, exploit resistance and compatibility in our environments until independently tested.

Upstream root LICENSE: MIT, copyright 2025 rUv. This does **not** grant an automatic conclusion about every dependency, sample asset, hosted service, subsidiary package or model weights. Preserve notices and review each package and asset before copying; our preferred path is independent adapter implementation and feature-level behavioral learning.

## 2. Inspected evidence ledger

| Area | What source actually says/shows | Grade | Anchor |
| --- | --- | --- | --- |
| Local persistent memory | npm RuVector offers remember/recall under project, local embeddings with initial model download | OBSERVED-SOURCE (documented) | [README](https://github.com/ruvnet/RuVector/blob/46d816ddc4c2a8a06cd3613534a79b1d557d858b/README.md) |
| Vector backend | Rust core, optional storage, HNSW/flat and separate native/wasm/server/PG surfaces | OBSERVED-SOURCE (documented) | [README](https://github.com/ruvnet/RuVector/blob/46d816ddc4c2a8a06cd3613534a79b1d557d858b/README.md) |
| MCP permissions | readonly profile exists; if no policy, code permits all registered tools for backward compatibility | OBSERVED-SOURCE (code) | [mcp-policy.js](https://github.com/ruvnet/RuVector/blob/46d816ddc4c2a8a06cd3613534a79b1d557d858b/npm/packages/ruvector/bin/mcp-policy.js) |
| Learning | reads do not cause learning; SONA/feedback trajectories are a distinct component | OBSERVED-SOURCE (documented) | [README](https://github.com/ruvnet/RuVector/blob/46d816ddc4c2a8a06cd3613534a79b1d557d858b/README.md), [SONA](https://github.com/ruvnet/RuVector/blob/46d816ddc4c2a8a06cd3613534a79b1d557d858b/crates/sona/README.md) |
| Cluster admission | mincut-based write-time cluster decision, distinct from provenance/policy approval | OBSERVED-SOURCE (documented) | [memory-admission](https://github.com/ruvnet/RuVector/blob/46d816ddc4c2a8a06cd3613534a79b1d557d858b/crates/ruvector-memory-admission/README.md) |
| Retrieval receipts | hash/Merkle result-set commitments, with explicit unsigned/issuer limitations | OBSERVED-SOURCE (documented) | [retrieval-receipt](https://github.com/ruvnet/RuVector/blob/46d816ddc4c2a8a06cd3613534a79b1d557d858b/crates/ruvector-retrieval-receipt/README.md) |
| ANN quality | approximate bounded recall has no formal recall guarantee | OBSERVED-SOURCE (documented) | [recall-bounded](https://github.com/ruvnet/RuVector/blob/46d816ddc4c2a8a06cd3613534a79b1d557d858b/crates/ruvector-recall-bounded/README.md) |
| Performance | benchmark code and sample numbers exist; no user-workload proof | UPSTREAM-CLAIM | [benchmark guide](https://github.com/ruvnet/RuVector/blob/46d816ddc4c2a8a06cd3613534a79b1d557d858b/docs/benchmarks/BENCHMARKING_GUIDE.md) |
| Independent testing | No Rust workspace build, installer, benchmark, MCP server or native plugin executed during intake | UNKNOWN | this packet |
| User discussion | Public post was visible without substantive comments at intake | OBSERVED-SOURCE | [Reddit](https://www.reddit.com/r/aiagents/comments/1xasz2w/adaptive_memory_open_source/) |

**Important limits:** the repository's README groups System 0 (local decisions), System 1 (learn/remember), and System 2 (reason/orchestrate) as architectural concepts, **not** automatic feature tiers installed together. Type-safe local decisions are a separate package. Hosted shared memory crosses a network/trust boundary. Models may be downloaded on first local semantic command unless explicitly provisioned.

## 3. Reconstructed flows

**Capture / store**  
agent/user/session/receipt event → proposed scoped memory record → caller-owned authorization, provenance and sensitivity gate → canonical store commit → lexical/optional vector index update → append-only audit/replay.

**Recall**  
task intent + authenticated identity + scope + time → prefilter authorized candidate partitions → lexical baseline and optional semantic provider → authorized candidates and source checks → rank for relevance/freshness/evidence (never truth by similarity alone) → bounded verified-context pack → agent; record retrieval receipt with IDs/hashes and permitted omissions.

**Adaptive improvement (optional)**  
agent executes task → verifier produces outcome/quality receipt → typed feedback proposal referencing that receipt → policy/human gate → offline evaluated ranking/route update → canary or rollback → future recall. No implicit feedback from a read, search click or repeated retrieval.

### Owned architecture (conceptual)

```text
Canonical Work/Session/Shipping Truth --(typed candidate)--> Memory Proposal
                                                |
                                    scope + provenance + policy gate
                                                |
                                          Memory Plane (#166)
                                     / lexical store | graph edges \
                                                |
                  request + identity --> retrieval provider (optional RuVector)
                                                |
                                 authorization + source verification
                                                |
                         bounded Context Pack (#115) + retrieval receipt
                                                |
                                        Agent Work OS runner
                                                |
                                       Shipping OS proof
                                                |
                      verified feedback proposal (separate gated lane)
```

The retrieval provider is a **derived index**, not the canonical facts, execution authorization, policy, source of truth, or provider of verified proof.

## 4. Internal overlap and true capability gap

| Existing ownership | Present/defined in our roadmap | RuVector adds to evaluate, not duplicate |
| --- | --- | --- |
| [#166 Memory Plane](https://github.com/rrahul0904/agent-work-os/issues/166) | Propose/commit, scopes, lexical fallback, vector provider, lifecycle, replay, purge | Retrieval plug-in suitability; ANN+hybrid ranking and audited quality across loads |
| [#115 Dory Context Pack](https://github.com/rrahul0904/agent-work-os/issues/115) | Deterministic bounded context projection and supersession | More efficient evidence candidate generation only |
| [#9 continuity](https://github.com/rrahul0904/agent-work-os/issues/9), [#21 Brain](https://github.com/rrahul0904/agent-work-os/issues/21) | Verified handoffs and shared context | Feedback from verified task outcomes, not another context authority |
| [#62 browser learning](https://github.com/rrahul0904/agent-work-os/issues/62) | Verified browser-route learning | General retrieval/eval methods; no replacement for domain-specific proof |
| [#301 MinniMemory](https://github.com/rrahul0904/agent-work-os/issues/301) | Context economics and reversible source layout | ANN retrieval quality and per-query effort/latency budgets |
| REA / Shipping OS | Source evidence and exact-SHA release proof | Reproducible donor comparison; no live execution outside gate |

**Unique proposed ownership:** provider-neutral retrieval/evaluation contracts, outcome-backed adaptive-feedback proposals, and explicit read-side retrieval receipts. These are extensions of #166, not a new repository or parallel memory truth.

## 5. MATCH / IMPROVE / NEW / OMIT

**MATCH:** local-first project memory; durable restart recall; embeddings/vector/hybrid search; optional graph links; repeatable model/backend evaluation; MCP as an integration surface.

**IMPROVE:** add strict tenant/repo/worktree authorization *before or during* candidate selection; validate sources and current validity after retrieval; separate memory truth from index; provenance/citation and immutable source digests; safe lexical fallback during outage; explicit purge over store/index/exports/replicas; deterministic positive and negative feedback gated by verified receipts; non-adaptive default; protect against memory poisoning and instructions hidden in retrieved records.

**NEW:**
1. `memory-retrieval-provider/v1`: candidate API (query, scope, policy digest, topK, backend fingerprint, latency budget) and returned score/distance, record ID, source hash, index revision. Never trust backend authorization claims.
2. `memory-feedback-proposal/v1`: verified outcome receipt reference, task/run hash, evaluator version, considered relevant/irrelevant memory IDs, proposed update, approval and rollback pointer; no model-triggered final state mutation.
3. `adaptive-memory-eval/v1`: frozen baseline/adaptive corpus with relevance labels; report recall@k, nDCG@k, citation validity, zero foreign-scope leak, abstention, poisoning rejection, p50/p95/p99, memory/disk, disk IO and warmup/download conditions.
4. `memory-retrieval-receipt/v1`: query digest, policy digest, caller scope, index/backend/model fingerprints, result IDs and source digests, excluded reasons, ordered top-k and local envelope hash. Tamper-evident receipt **does not establish the truth or completeness of retrieval**.

**OMIT/DEFER:** standalone graph/vector DB clone, automatic SONA/LoRA on every user action, native package install into production, default open MCP write tools, arbitrary runtime network downloads, proprietary hosted shared memory, complex GNN/RVF/quantization until independent lift warrants complexity, rebranding upstream source/assets.

## 6. Threat and failure register

| Risk | Required defense and test |
| --- | --- |
| Project/tenant cross-contamination | authenticate before retrieval, partition and authorize candidates, negative cross-scope corpus |
| ANN starvation of authorized results | filter/partition during candidate generation or overfetch with a bounded policy; never treat post-filter topK as adequate recall |
| Prompt injection / untrusted donor instructions | classify retrieved text as data, not agent instruction; REA namespace cannot feed implementation agents without approved derived contract |
| Memory poisoning / invented feedback | only outcome receipts independently verified by Shipping OS can propose rank learning; rank change audited, reversible and evaluated |
| Supersession / stale cache | generation IDs, index invalidation and current-truth check at pack construction |
| GDPR/user purge / exported copies | authorized deletion across canonical records, indexes, model/embedding caches, snapshots, backups per retention policy |
| MCP tool widening | explicit allowlist and read-only start; code's default allow-all is unacceptable in governed deployment |
| Vector semantic false confidence | attach evidence grade/source and allow abstention; vector score never upgrades grade |
| Embedding provider failure/model mismatch | preserve lexical result baseline; no corrupt writes or hidden model download |
| Receipt overclaim | unsigned hash proof gives tamper detection, not issuing identity, fact truth or actual top-k completeness |
| Benchmark overclaim | same corpus, recall target, setup, platform, backend/version and identical limits; no borrowed upstream numbers |

## 7. Evaluation contract and adoption gates

See **adaptive-memory-eval-cases.json** in this directory. The corpus is synthetic and contains expected policy assertions, not observed donor output.

**Baseline arms:** A0 lexical only with no model, A1 lexical + pinned local embeddings, A2 vector + hybrid rerank, A3 adaptive ranking using only approved/verifiable outcome receipts. Hold query set/labels fixed, separate training from evaluation, record both quality and effort. Adopt A2/A3 only if zero scope/secret leakage, non-regressed source/citation correctness, recoverable purge, stable restart and demonstrable quality-effort benefit over A0 on the same dataset.

**Minimum tests:** (1) fresh-process recall; (2) wrong repo/worktree/tenant denial; (3) no REA namespace leakage; (4) superseded/retracted/expired exclusion; (5) purge propagation; (6) no model and outage fallback; (7) no learning from reads; (8) failed/forged feedback rejected; (9) verified success proposal and reversible approval; (10) source hashes preserved; (11) deterministic replay/digests; (12) bounded topK, timeout and index rebuild; (13) malicious retrieved instructions never become permissions; (14) warm/cold benchmark including model download preflight.

**Platform matrix:** Node 22 on macOS arm64, Linux x64/arm64 and Windows x64; native dependency availability must be verified for each platform instead of inferred from upstream documentation. iOS/iPadOS/Android would require explicit separately tested WASM/mobile designs, not assumptions that a desktop native binary works there.

## 8. Execution order and stop conditions

1. **Research (this draft):** pin SHA, reconcile donors, capture behavior, code-backed policies, risks, fixture spec, accept/reject criteria.
2. **Gate:** #166 owner confirms #166's bounded BUILDING slot and existing memory contract shape; no extra parallel memory authority.
3. **Slice A:** write pure JS provider adapter contract with lexical no-embedder baseline, disabled-by-default plugin.
4. **Slice B:** synthetic fixture exact ID/authorization, stale/poisoning, durability and purge tests; independent reviewer.
5. **Slice C:** opt-in local RuVector read-only package/backend evaluation in a sandbox with pinned hashes, models, permissions and disabled external writes.
6. **Slice D:** feedback proposals with verified receipt threshold, rollback and holdout comparison; no online autonomous learning as default.
7. **Shipping gate:** exact-SHA CI, clean checkout, process restart, multi-platform security, repeatable benchmarking and receipts; human merge/deploy/promotion approval.

**Current outcome:** research-only evidence and acceptance contract; no vendor binary execution, no actual Node/Rust integration, no donor parity and no verified performance claim. Do not update project tracker to SHIPPED or COMPLETED merely because this draft PR exists.
