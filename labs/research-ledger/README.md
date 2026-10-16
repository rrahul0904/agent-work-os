# Research Ledger v0.2

Research Ledger is the owned research/knowledge-workbench module inside Agent Work OS. It combines local notebook-style document research with provenance, decision lineage, evidence drift and governed downstream execution.

## What ships in v0.2

- Local PDF/TXT/Markdown/CSV/HTML upload and browser-side text extraction.
- Browser IndexedDB persistence for source documents.
- Deterministic local chunking and retrieval.
- Exact passage IDs used as citations and clickable source inspection.
- Grounded answer / comparison / recommendation briefs.
- Studio outputs: summary, FAQ, study guide and two-host podcast script.
- Browser SpeechSynthesis playback for podcast scripts.
- Demo-safe local fallback when no model provider is configured.
- Optional server-side OpenAI Responses API adapter; only retrieved passages are sent, never the whole notebook by default.
- Explicit URL, pasted source, AI-chat, browser-capture and REA-bundle ingestion.
- JSON/Markdown export, evidence hashing/drift checks and Agent Work OS handoff.

## Run

Use any static server for the UI. Deploy to Vercel to activate `/api/research`.

```bash
npm test
npx vercel dev
```

## Optional live generation

Set `OPENAI_API_KEY`. `OPENAI_MODEL` is optional and defaults to `gpt-6-astra`.

Without an API key, `/api/research` reports `live: false` and the browser keeps research local using deterministic retrieval/extractive generation.

## Privacy contract

Documents and chunks are stored in browser IndexedDB. Local retrieval runs entirely in the browser. In live generation mode, the UI sends only the top retrieved passages to the serverless generation endpoint. AI-chat imports are labeled as context and do not count as independent verification.

## Clean-room note

ResearchBench (`VikingOwl91/research-bench`) is AGPL-3.0-or-later. Research Ledger does not copy its source or assets. The public repository, public demo behavior and Reddit launch post are treated as product evidence/donor signals only. See `docs/REA_REPORT.md`.
