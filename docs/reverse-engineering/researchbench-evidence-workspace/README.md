# Research / Evidence Workspace — governed REA dossier

Status: `RETRIEVAL_KERNEL_VERIFIED / CLEAN_ROOM / NOT_SHIPPABLE`

## Target identity

Reference target: **ResearchBench** (`VikingOwl91/research-bench`), surfaced from the Reddit r/SideProject share on 2026-10-16.

Reference classification: **DONOR / REFERENCE**, not a standalone owned clone.

Canonical owned destination: **Agent Work OS Research / Evidence Workspace**, with evidence contracts owned by the Agent Work OS evidence plane and browser UX remaining a projection rather than a second source of truth.

Branch: `rea/researchbench-evidence-workspace`.

Draft PR: `#218`.

Verified implementation SHA for the current retrieval slice: `fdf159759113dfa7346bb5a1f8bb11a1d6036f80`.

## Canonical roadmap

Target/Source → Discovery → REA Investigation → Evidence → Understanding → Reconstruction → Specification → Improvement → Build → Verify → Compare → Deploy → Certify.

REA supplies governed reverse-engineering evidence. Agent Work OS remains the authority for provenance, policy, authorization, canonical identities, replay, verification, deployment, and Shipping OS gates.

## Repository routing decision

This target is a donor for an existing owned product boundary. Do **not** create another standalone repository. The capability belongs in `rrahul0904/agent-work-os` because research evidence, agent consumption, verification receipts, source policy, and generated artifacts all need to converge on Agent Work OS authority.

## Evidence classification

- **Observed** — ResearchBench is browser-first and keeps its document processing/retrieval workflow local rather than requiring an application backend for the source corpus.
- **Observed** — the donor demonstrates canonical document text, chunking/embedding/retrieval, source-backed answers, exact citation navigation, study artifacts, and generated two-host audio.
- **Observed** — the donor separates document processing from model generation and supports user-provided model access rather than a single hard-coded provider.
- **Observed** — the donor documentation treats citation validity and semantic support as different problems; structurally valid citations do not prove claim entailment.
- **Observed** — donor scope leaves major product surface open, including richer web/connectors, OCR breadth, collaboration/sync, interactive audio, and several NotebookLM-style artifact types.
- **Observed** — donor repository licensing is AGPL-3.0, so implementation code is outside the clean-room reuse boundary for our permissively licensed/commercial core.
- **Inferred** — local parsing, local embeddings, exact source spans, evidence receipts, and provider-neutral generation are reusable product patterns independent of ResearchBench branding or source code.
- **Implemented and verified in our branch** — workspace-scoped canonical evidence, exact source spans, deterministic receipts, local text ingestion/chunking, deterministic lexical retrieval, exact cosine vector retrieval over fixture embeddings, receipt-bound weighted-RRF hybrid fusion, retrieval benchmark metrics, and independent semantic-verification receipts.

## Clean-room boundary

The donor is used as behavioral and architectural evidence only. Do not copy source files, UI composition, branding, assets, prose, tests, or internal implementation from the AGPL repository into Agent Work OS.

Allowed inputs for reconstruction are independently authored specifications, observed product behavior, public documentation, protocol/format facts, and generic engineering techniques. Any future comparison harness must compare externally observable behavior or independently generated fixtures rather than importing donor implementation code.

## Owned architecture

```text
Source Fabric
  PDF / Office / text / markdown / URL / web / YouTube / GitHub / connected sources
        │
        ▼
Canonicalization + Revision Fence
        │
        ├── workspace identity
        ├── canonical document hash
        ├── exact source revision
        └── immutable source identity
        │
        ▼
Evidence Engine
        ├── chunks / embeddings / lexical + vector + hybrid retrieval
        ├── exact EvidenceSpan offsets
        ├── quote/hash/vector/index integrity
        └── retrieval receipt
        │
        ▼
Claim Verification
        ├── Claim → EvidenceSpan edges
        ├── structural citation gate
        ├── semantic entailment gate
        ├── contradiction checks
        ├── quote/number checks
        └── verifier receipt
        │
        ▼
Research Agent + Artifact Studio
        ├── cited answers / compare / synthesize
        ├── report / FAQ / study guide / quiz
        ├── diagrams / slides
        └── audio / tutorial outputs
        │
        ▼
Agent Work OS
  provenance / policy / authorization / replay / Shipping OS
```

## Current implementation slice

Implemented and verified through SHA `fdf15975`:

- `packages/evidence/src/research-workspace.js`
  - `research-evidence/v0.2`
  - workspace-scoped `CanonicalDocument`, `EvidenceSpan`, and `Claim`
  - structural bundle validation and cross-workspace rejection
  - deterministic research and retrieval receipts
  - source-revision and exact-span integrity checks
- `packages/evidence/src/claim-verification.js`
  - verifier identity/revision and claim-text binding
  - `entailed`, `contradicted`, `insufficient`, `not_checked` states
  - receipt-integrity validation
  - semantic gate that passes only when every claim has an intact, independently recorded `entailed` receipt
- `packages/evidence/src/source-ingestion.js`
  - deterministic local text ingestion
  - fixed-character-window chunking with bounded overlap
- `packages/evidence/src/retrieval-index.js`
  - retriever descriptors
  - deterministic index manifests
  - source/span/model identity binding
  - manifest integrity and stale-index checks
- `packages/evidence/src/local-retriever.js`
  - deterministic Unicode lexical retrieval baseline
  - source-drift hard failure
  - valid empty results when no evidence matches
- `packages/evidence/src/vector-retriever.js`
  - provider-neutral embedding-record contract
  - exact cosine ranking
  - embedding-model/dimension/vector-hash/source-revision checks
  - zero-vector rejection and configurable minimum score
  - deterministic vector retrieval receipts
- `packages/evidence/src/hybrid-retriever.js`
  - weighted reciprocal-rank fusion
  - component receipt hash binding
  - same-workspace/query/index-revision checks
  - positive/unique-rank and finite-score validation
  - consensus evidence can outrank a single-retriever hit by design
- `packages/evidence/src/retrieval-benchmark.js`
  - Recall@K
  - Hit Rate@K
  - Mean Reciprocal Rank
  - baseline-versus-candidate deltas

The full repository `npm test` and `npm run acceptance` suites passed on exact SHA `fdf159759113dfa7346bb5a1f8bb11a1d6036f80` after an earlier CI run correctly caught a bad hybrid-ranking test expectation. That expectation was fixed to match weighted-RRF consensus behavior.

Important boundary: vector search is currently verified with deterministic fixture vectors. A production browser/local embedding model has **not** been integrated yet, and the benchmark harness does not yet have a golden real-world corpus/result set.

Structural evidence and semantic evidence remain separate gates. `STRUCTURAL_EVIDENCE_VALID` is never treated as proof of entailment. Only independently recorded claim-verification receipts can satisfy `SEMANTIC_EVIDENCE_VERIFIED`.

## Neutral contracts

### CanonicalDocument

Binds canonical text to `workspaceId`, `documentId`, `sourceId`, `revision`, media type, canonical text length, and SHA-256 content identity.

### EvidenceSpan

Binds a citation to one workspace and one canonical document revision with exact character offsets. The quoted text and quote SHA-256 are retained so replay can detect mutation or stale indexing.

### Claim

Binds one generated assertion to one workspace and one or more stable evidence span IDs. Duplicate evidence IDs are normalized away and ordering is deterministic.

### RetrievalReceipt

Binds `workspaceId`, query identity/text, exact index revision, retriever identity, retrieval parameters, result ranks/scores, and a deterministic receipt hash.

### IndexManifest

Binds indexed evidence to source revisions, quote hashes, chunk policy, retriever version, and embedding provider/model/dimensions where applicable.

### EmbeddingRecord

Binds one vector to a specific evidence span, source revision, quote hash, provider/model identity, dimensions, and vector hash.

### ClaimVerificationReceipt

Binds one claim to the exact evidence spans reviewed plus verifier identity, verifier revision, method, status, optional score, reason codes, and a deterministic receipt hash.

### ResearchReceipt

Contains sorted document revision identities, evidence span metadata, claims, verifier identity, and a deterministic SHA-256 over the canonical payload. The receipt explicitly records that semantic verification is still required.

## Acceptance gates

P0 gates:

1. Existing repository test suite remains green with the new evidence/retrieval tests.
2. Every generated answer claim must reference known evidence spans from the same workspace/source revision set.
3. Revision drift or quote/hash mismatch must hard-fail before generation output is accepted.
4. Structural citation validity must never be represented as semantic support.
5. Cross-workspace evidence references must hard-fail.
6. Retrieval parameters and result IDs must be part of deterministic retrieval receipts.
7. Claim verifier results must be versioned by verifier/model/policy identity.
8. A semantic gate may pass only when every claim has an `entailed` receipt.
9. Contradicted, insufficient, unchecked, or missing claim verification must keep the semantic gate closed.
10. Index, embedding and component-retrieval receipt mutation must fail closed.
11. Zero/low-signal vector queries must be able to return no evidence instead of arbitrary citations.
12. Hybrid ranking must be benchmarked against lexical/vector baselines before being selected as the default retriever.
13. No donor AGPL implementation code may enter the owned branch.

## Build sequence

### RE-01 — Evidence package and provenance

Capture donor identity, license, public behavior, capabilities, gaps, and clean-room boundary. Status: **IMPLEMENTED CORE / MORE SOURCE PINNING PENDING**.

### RE-02 — Neutral evidence contracts

Canonical source revisions, exact spans, claims, workspace isolation, retrieval receipts, structural validation, claim-verification receipts, semantic gating and tamper checks. Status: **VERIFIED CORE**.

### RE-03 — Local research kernel

Text ingestion/chunking, lexical retrieval, exact vector retrieval contract/engine, hybrid fusion, index/version integrity and benchmark metrics are **VERIFIED**. Production local embedding execution, golden benchmark corpus/results, OCR/PDF parsing, cancellation and larger-corpus performance work remain **NEXT**.

### RE-04 — Grounding verifier

Actual verifier adapters for entailment, contradiction detection, numerical/quotation verification, unsupported-claim quarantine, verifier disagreement handling, and benchmarked independent review remain **NEXT AFTER PRODUCTION EMBEDDINGS / CORPUS**. Contract and gate foundation are **VERIFIED**.

### RE-05 — Source Fabric

Files beyond plain text, URLs, websites, YouTube/transcripts, GitHub, Google Drive/connected sources, and REA evidence-package ingestion. Status: **PLANNED**.

### RE-06 — Research Agent + Studio

Cited chat/research, compare/synthesize, reports, study guides, quizzes, mind maps, diagrams, decks, audio and tutorial outputs. Existing Presentation/Diagram/Learn Anything capabilities should consume the same evidence contracts instead of inventing parallel citation systems. Status: **PLANNED**.

### RE-07 — Verification and Shipping OS

Golden retrieval corpus, malicious-document corpus, citation integrity, semantic grounding benchmarks, browser privacy/network tests, replay equivalence, exact-SHA build evidence, independent review, staging/UAT, production verification, immutable Shipping OS certification. Status: **PLANNED**.

## Product differentiation

Do not position the owned capability as a NotebookLM clone.

Owned direction:

`private sources → canonical revisions → evidence graph → benchmarked retrieval → research → independent claim verification → artifacts → agents → replayable receipts`

The commercial value is governed research that other agents can safely consume, not merely AI summaries or podcasts.

## Shipping posture

This branch is an implementation branch, not a release claim. No `SHIPPABLE` or `SHIPPED` status is permitted until production embedding execution, real retrieval/grounding benchmarks, security/privacy checks, browser UAT, deployment evidence, and Shipping OS certification all exist.
