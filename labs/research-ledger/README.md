# Research Ledger v0.2

Research Ledger is the owned research/knowledge-workbench module inside Agent Work OS. It combines local notebook-style document research with provenance, decision lineage, evidence drift and governed downstream execution.

## ResearchBench convergence

The Oct. 16, 2026 Reddit target resolves to ResearchBench (`VikingOwl91/research-bench`), a browser-first NotebookLM-style research application. REA classifies it as a donor/reference for Research Ledger, not a standalone product. The donor is AGPL-3.0-or-later, so this implementation is clean-room: public behavior and product capabilities are evidence; donor source, prompts, CSS, assets and tests are not copied.

## v0.2 scope

- Local PDF/TXT/Markdown/CSV/HTML upload and browser-side extraction.
- Browser persistence for source documents.
- Deterministic local chunking and retrieval.
- Exact passage IDs used as citations and clickable source inspection.
- Grounded answer / comparison / recommendation briefs.
- Studio outputs: summary, FAQ, study guide and two-host podcast script.
- Browser SpeechSynthesis playback for podcast scripts.
- Local fallback with no provider key.
- Optional server-side OpenAI Responses adapter; only retrieved passages are sent by default.
- Explicit URL, pasted source, AI-chat, browser-capture and REA-bundle ingestion.
- JSON/Markdown export, evidence hashing/drift checks and Agent Work OS handoff.

## Run

```bash
npm test
npx vercel dev
```

Set `OPENAI_API_KEY` for optional live generation. `OPENAI_MODEL` is optional and defaults to `gpt-5.6`.

## Privacy contract

Documents and chunks stay browser-side. Local retrieval requires no model provider. When live generation is enabled, the UI sends only the bounded top retrieved passages to the serverless endpoint. AI-chat imports are context and do not count as independent verification.

See `docs/REA_REPORT.md` for the clean-room capability matrix and release gates.
