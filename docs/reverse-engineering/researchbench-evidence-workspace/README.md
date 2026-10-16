# Research / Evidence Workspace — governed REA dossier

Status: `FOUNDATION_IMPLEMENTING / CLEAN_ROOM / NOT_SHIPPABLE`

## Target identity

Reference target: **ResearchBench** (`VikingOwl91/research-bench`), surfaced from the Reddit r/SideProject share on 2026-10-16.

Reference classification: **DONOR / REFERENCE**, not a standalone owned clone.

Canonical owned destination: **Agent Work OS Research / Evidence Workspace**, with evidence contracts owned by the Agent Work OS evidence plane and browser UX remaining a projection rather than a second source of truth.

Branch: `rea/researchbench-evidence-workspace`.

Draft PR: `#218`.

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
- **Implemented in our branch** — provider-neutral evidence contracts now bind workspace identity, canonical document revisions, exact character spans, claims, retrieval parameters/results, structural validation, deterministic receipts, and independent semantic-verification receipts.

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
        ├── chunks / embeddings / hybrid retrieval
        ├── exact EvidenceSpan offsets
        ├── quote/hash integrity
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

Implemented on this branch:

- `packages/evidence/src/research-workspace.js`
  - `research-evidence/v0.2`
  - workspace-scoped `CanonicalDocument`
  - workspace-scoped `EvidenceSpan`
  - workspace-scoped `Claim`
  - structural bundle validation
  - cross-workspace evidence rejection
  - deterministic research receipt
  - deterministic retrieval receipt
  - source-revision and exact-span integrity checks
- `packages/evidence/src/claim-verification.js`
  - independent verifier identity + revision
  - `entailed`, `contradicted`, `insufficient`, `not_checked` states
  - evidence-bound verification receipts
  - semantic gate that passes only when every claim is independently entailed
- `services/control-api/test/research-evidence-contract.test.js`
  - deterministic text normalization
  - revision-bound exact spans
  - unknown-evidence rejection
  - source-revision drift rejection
  - workspace-isolation rejection
  - deterministic retrieval receipt hashing
  - explicit semantic-verification requirement
  - deterministic research receipt hashing independent of collection order
- `services/control-api/test/claim-verification.test.js`
  - verifier identity/revision binding
  - unlinked-evidence rejection
  - contradicted-claim gate failure
  - missing-verification gate failure

Important boundary: structural evidence and semantic evidence remain separate gates. `STRUCTURAL_EVIDENCE_VALID` is never treated as proof of entailment. Only independently recorded claim-verification receipts can satisfy `SEMANTIC_EVIDENCE_VERIFIED`.

## Neutral contracts

### CanonicalDocument

Binds canonical text to `workspaceId`, `documentId`, `sourceId`, `revision`, media type, canonical text length, and SHA-256 content identity.

### EvidenceSpan

Binds a citation to one workspace and one canonical document revision with exact character offsets. The quoted text and quote SHA-256 are retained so replay can detect mutation or stale indexing.

### Claim

Binds one generated assertion to one workspace and one or more stable evidence span IDs. Duplicate evidence IDs are normalized away and ordering is deterministic.

### RetrievalReceipt

Binds `workspaceId`, query identity/text, exact index revision, retriever identity, retrieval parameters, result ranks/scores, and a deterministic receipt hash.

### ClaimVerificationReceipt

Binds one claim to the exact evidence spans reviewed plus verifier identity, verifier revision, method, status, optional score, reason codes, and a deterministic receipt hash.

### ResearchReceipt

Contains sorted document revision identities, evidence span metadata, claims, verifier identity, and a deterministic SHA-256 over the canonical payload. The receipt explicitly records that semantic verification is still required.

## Acceptance gates

P0 gates:

1. Existing repository test suite remains green with the new contract tests.
2. Every generated answer claim must reference known evidence spans from the same workspace/source revision set.
3. Revision drift or quote/hash mismatch must hard-fail before generation output is accepted.
4. Structural citation validity must never be represented as semantic support.
5. Cross-workspace evidence references must hard-fail.
6. Retrieval parameters and result IDs must be part of deterministic retrieval receipts.
7. Claim verifier results must be versioned by verifier/model/policy identity.
8. A semantic gate may pass only when every claim has an `entailed` receipt.
9. Contradicted, insufficient, unchecked, or missing claim verification must keep the semantic gate closed.
10. No donor AGPL implementation code may enter the owned branch.

## Build sequence

### RE-01 — Evidence package and provenance

Capture donor identity, license, public behavior, capabilities, gaps, and clean-room boundary. Status: **IMPLEMENTED CORE / MORE SOURCE PINNING PENDING**.

### RE-02 — Neutral evidence contracts

Canonical source revisions, exact spans, claims, workspace isolation, retrieval receipts, structural validation, claim-verification receipts, and semantic gating. Status: **IMPLEMENTED CORE / CI VERIFICATION PENDING**.

### RE-03 — Local research kernel

Add source adapters, canonicalization adapters, OCR boundary, chunking, local embedding adapter, hybrid retrieval, reranking, cancellation, indexing version, and retrieval execution receipts. Status: **NEXT**.

### RE-04 — Grounding verifier

Add actual verifier adapters for entailment, contradiction detection, numerical/quotation verification, unsupported-claim quarantine, verifier disagreement handling, and benchmarked independent review. Contract foundation is **IMPLEMENTED**; verifier execution is **NEXT AFTER RE-03**.

### RE-05 — Source Fabric

Files, URLs, websites, YouTube/transcripts, GitHub, Google Drive/connected sources, and REA evidence-package ingestion. Status: **PLANNED**.

### RE-06 — Research Agent + Studio

Cited chat/research, compare/synthesize, reports, study guides, quizzes, mind maps, diagrams, decks, audio and tutorial outputs. Existing Presentation/Diagram/Learn Anything capabilities should consume the same evidence contracts instead of inventing parallel citation systems. Status: **PLANNED**.

### RE-07 — Verification and Shipping OS

Golden retrieval corpus, malicious-document corpus, citation integrity, semantic grounding benchmarks, browser privacy/network tests, replay equivalence, exact-SHA build evidence, independent review, staging/UAT, production verification, immutable Shipping OS certification. Status: **PLANNED**.

## Product differentiation

Do not position the owned capability as a NotebookLM clone.

Owned direction:

`private sources → canonical revisions → evidence graph → research → independent claim verification → artifacts → agents → replayable receipts`

The commercial value is governed research that other agents can safely consume, not merely AI summaries or podcasts.

## Shipping posture

This branch is an implementation branch, not a release claim. No `SHIPPABLE` or `SHIPPED` status is permitted until exact-SHA CI, retrieval/grounding benchmarks, security/privacy checks, browser UAT, deployment evidence, and Shipping OS certification all exist.
