# REA Clean-Room Reverse Engineering Report — Research Ledger

## Target identity

**New donor:** ResearchBench (`VikingOwl91/research-bench`), surfaced from the Oct. 16, 2026 r/SideProject post “I spent 4 days on a take-home assignment. Things escalated.” The project describes itself as an open-source, browser-first NotebookLM-style research application using SvelteKit plus Rust/WebAssembly.

**Prior donor:** SourceFrame (`sourceframe.app`) and its public launch material. SourceFrame informed browser/AI-chat capture, structured research artifacts, provenance, evidence gaps and workspace ideas already present in Research Ledger.

REA treats both as evidence providers, not implementation authorities. Agent Work OS remains the authority for orchestration, provenance, clean-room boundaries, verification, replay and shipping gates.

## Public evidence captured from ResearchBench

Public README / launch evidence supports these capabilities:

1. Upload and organize PDF, Markdown and TXT source documents.
2. Local document processing, chunking, embeddings/indexing and semantic search.
3. Source-grounded Q&A with citations that open the cited passage.
4. Summary, FAQ and study-guide generation against the same source set.
5. Two-host AI-generated podcast output with cited transcript and audio playback/download.
6. Browser persistence for sources, indices, chat and generated material.
7. Bring-your-own/provider-based generation while local search works without a key.
8. Worker-based heavy processing and explicit cancellation/recovery paths.
9. Extensive automated unit, Rust, end-to-end and security testing.
10. Multilingual (English/German) experimentation.

## License / clean-room boundary

ResearchBench is **AGPL-3.0-or-later**. We do not transplant code, prompts, CSS, assets, tests or generated build output into Agent Work OS. This convergence is an independent implementation based on observable/public capabilities and our pre-existing Research Ledger contracts.

## Product consolidation decision

Do **not** create another standalone NotebookLM clone. ResearchBench becomes a donor for the existing **Research Ledger / Learn Anything** surface inside Agent Work OS.

Canonical ownership:

- **REA:** target identity, evidence capture, capability matrix, license/provenance record.
- **Research Ledger:** local source notebook, retrieval, citations, research artifacts, lineage, drift.
- **Learn Anything Studio:** learning-oriented presentation of summaries, FAQ and study guides when that UX is needed.
- **Agent Work OS:** downstream handoff, policy, replay, receipts, task/plan execution.
- **Creator / Presentation modules:** optional publication or presentation of accepted research outputs.

## Donor-to-owned capability matrix

| Public donor pattern | Research Ledger owned implementation | v0.2 status |
|---|---|---|
| Browser-first source library | IndexedDB source notebook | Implemented |
| PDF/TXT/MD ingestion | Browser extraction + PDF.js runtime adapter | Implemented |
| Chunk/index locally | Deterministic browser chunker | Implemented |
| Semantic retrieval | Local lexical/hybrid relevance retrieval; semantic embeddings remain a later lane | Partial / honest label |
| Source-grounded Q&A | Top-passage retrieval + exact evidence IDs | Implemented |
| Click citation → passage | Passage dialog bound to local chunk ID | Implemented |
| Summary / FAQ / study guide | Studio output contract with local fallback + optional live generation | Implemented |
| Two-host podcast | Cited two-host transcript + local SpeechSynthesis playback | Implemented (audio download later) |
| BYO/provider generation | Server-side provider adapter with local-only fallback | Implemented, different security model |
| Persistence | IndexedDB docs + local research snapshots | Implemented |
| Full semantic embedding model | Web worker / local model | Planned |
| Downloadable rendered podcast audio | Local render/encoder pipeline | Planned |
| Large automated test matrix | API smoke + syntax checks now; browser/E2E/security matrix next | Partial |

## Owned differentiation

Research Ledger is intentionally more than a NotebookLM-style notebook:

- **Decision Lineage:** prompt → retrieved passages → claims → gaps → decision state.
- **Evidence Drift:** local evidence hashes and future remote freshness/contradiction revalidation.
- **Research Contract:** machine-readable artifact for downstream agents.
- **Agent Work OS handoff:** accepted research becomes governed plans, tasks, diagrams, code changes, tests and receipts.
- **Replay:** future runs can compare an older decision against a changed evidence set.
- **REA bundle ingestion:** reverse-engineering evidence can enter the same provenance-aware notebook without being confused with independent verification.

## Canonical architecture

```mermaid
flowchart LR
  U[User] --> W[Research Ledger Web]
  F[Local files] --> X[Browser extract + chunk]
  B[Explicit browser capture] --> X
  R[REA evidence bundle] --> X
  X --> IDB[(IndexedDB)]
  IDB --> RET[Local retrieval]
  RET --> C[Exact passage IDs]
  C -->|local fallback| G[Grounded brief / Studio]
  C -->|top passages only| API[Optional provider API]
  API --> G
  G --> L[Decision lineage]
  L --> D[Drift / Replay]
  L --> H[Agent Work OS handoff]
```

## Security / privacy contract

- Capture is explicit; no passive browsing history ingestion.
- Documents persist locally in browser IndexedDB.
- Local search does not require a provider key.
- Live generation receives bounded top passages, not the entire notebook by default.
- AI-chat content is context-only unless backed by independent source evidence.
- No credential scraping or hidden capture.
- Untrusted source text is rendered as text, not executable HTML.
- Input size and evidence-count limits are enforced at the server boundary.

## Verification gates for this convergence

v0.2 acceptance requires:

1. Static JS and API syntax checks pass.
2. API local-mode smoke tests pass.
3. Vercel preview build reaches READY.
4. `GET /api/research` returns provider status without exposing secrets.
5. Main page returns 200 and includes local notebook controls.
6. The deployed source SHA is recorded.
7. Production promotion is a separate gate after preview verification.

## Next lanes

1. Local multilingual embedding model in a Web Worker, benchmarked against lexical retrieval.
2. Page-aware PDF citation geometry/highlighting instead of text-only passage dialogs.
3. Audio rendering/encoding worker for downloadable podcasts.
4. Durable notebook/version graph with explicit variants and replay diffs.
5. Remote URL freshness fetcher and scheduled drift checks.
6. Playwright E2E, accessibility, CSP/security and capacity benchmarks.
7. Native import/export contract shared with Learn Anything Studio and the wider Agent Work OS capability registry.
