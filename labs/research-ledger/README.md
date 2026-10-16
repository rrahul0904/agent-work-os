# Research Ledger v0.3

Research Ledger is the owned research/evidence workbench inside Agent Work OS. It combines a local-first source notebook with governed evidence contracts, durable decision lineage, replay, drift detection, and bounded downstream execution.

## What ships in v0.3

### Browser research surface
- Local PDF/TXT/Markdown/CSV/HTML upload and browser-side text extraction.
- IndexedDB persistence for source documents.
- Deterministic local chunking and retrieval.
- Exact passage IDs used as citations and clickable source inspection.
- Grounded answer / comparison / recommendation briefs.
- Studio outputs: summary, FAQ, study guide and two-host podcast script.
- Browser SpeechSynthesis playback for podcast scripts.
- Demo-safe local fallback when no model provider is configured.
- Optional server-side OpenAI Responses API adapter; only retrieved passages are sent, never the whole notebook by default.
- Explicit URL, pasted-source, AI-chat, browser-capture and REA-bundle ingestion.

### Governed evidence kernel
- Workspace-scoped canonical documents with revision and content hashes.
- Exact evidence spans with offset + quote-hash integrity.
- Claim → evidence-span contracts and cross-workspace rejection.
- Deterministic research/retrieval receipts and index manifests.
- Claim verification receipts with `entailed`, `contradicted`, `insufficient`, and `not_checked` states.
- Lexical, vector and receipt-bound hybrid retrieval primitives plus benchmark metrics.

### v0.3 lineage / replay
- Integrity-bound research snapshots.
- Acyclic version graph with explicit parent snapshots, roots and heads.
- Deterministic diffs for document revisions, claims, evidence sets, gaps and decision state.
- Replay receipts bound to exact graph/snapshot digests.
- Browser-side durable version history and branch-from-old-decision UX.
- Canonical `research-version-graph/v1` export contract.
- Canonical `agent-work-os/research-handoff/v1` contract binding downstream work to the accepted snapshot.
- Governed handoff defaults: bounded network, reversible auto-advance, explicit approval for external writes, merge, production deploy, credential changes and billing changes.

## Architecture boundary

`labs/research-ledger/legacy-app.js` preserves the verified v0.2 browser surface byte-for-byte. `app.js` loads that surface and then layers `v03.js` version history plus `v03-contract.js` canonical export behavior. The authoritative reusable evidence contracts live under `packages/evidence/src/` rather than inside the browser lab.

## Run

Use any static server for the UI. Deploy to Vercel to activate `/api/research`.

```bash
npm test
npm run check
npx vercel dev
```

The repository-wide verification gate is also expected to pass from the repository root:

```bash
npm test
npm run acceptance
```

## Optional live generation

Set `OPENAI_API_KEY`. `OPENAI_MODEL` is optional and defaults to `gpt-6-astra`.

Without an API key, `/api/research` reports `live: false` and the browser keeps research local using deterministic retrieval/extractive generation.

## Privacy and execution contract

Documents and chunks are stored in browser IndexedDB. Local retrieval runs entirely in the browser. In live generation mode, the UI sends only the top retrieved passages to the serverless generation endpoint. AI-chat imports are context-only unless independently supported. Research handoff does not itself authorize irreversible action: external writes, merge, production deployment, credential changes and billing changes remain approval-gated by Agent Work OS.

## Clean-room note

ResearchBench (`VikingOwl91/research-bench`) is AGPL-3.0-or-later. SourceFrame is also treated only as public behavioral/product evidence. Research Ledger does not copy donor source, CSS, assets, prompts, tests or build output. See `docs/REA_REPORT.md` and the repository reverse-engineering dossier.
