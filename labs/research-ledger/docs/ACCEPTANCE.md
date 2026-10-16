# Research Ledger v0.3 acceptance

## Functional
- Upload TXT/MD/CSV/HTML and extract text locally.
- Upload PDF via browser PDF.js adapter and index extracted page text.
- Persist documents in IndexedDB across reloads.
- Persist explicit captured sources across reloads.
- Run local passage search without an API key.
- Ask a question and get an extractive grounded brief when live AI is unavailable.
- In live mode, send only the retrieved passages to `/api/research`.
- Click evidence IDs to open exact passages and expose page markers for PDF-derived text.
- Generate Summary, FAQ, Study Guide and Podcast transcript outputs.
- Play podcast transcript with browser SpeechSynthesis.
- Save up to 50 durable research snapshots with evidence hashes.
- Diff an older snapshot against the current brief.
- Replay an older brief without mutating the underlying evidence store.
- Export/import the portable `research-ledger/notebook.v1` notebook contract.
- Export JSON/Markdown and Agent Work OS handoff JSON.
- Detect local evidence-set changes with SHA-256 hash comparison.
- Check explicitly captured public URLs through `/api/source-status` and compare freshness fingerprints.

## Safety / privacy
- No passive browsing capture.
- No document upload to provider unless passage retrieval selects bounded text and live generation is configured.
- No source HTML execution.
- Server evidence list and per-passage character counts are bounded.
- URL freshness checks refuse localhost, credential-bearing URLs, private IP literals and hostnames that resolve to private network addresses.
- URL freshness fetches use bounded response sampling, redirect re-validation and request timeouts.
- Portable notebook import validates schema and bounded document/snapshot counts before restore.

## Verification
- `npm run check` must pass, including syntax checks for app, completion layer, APIs and portable server.
- API smoke tests cover provider-disabled mode plus private-network refusal for freshness URLs.
- Repository CI must pass on the exact implementation SHA.

## Release gate
- Vercel or alternate preview is READY for the exact SHA.
- `GET /api/research` returns 200 with `live` boolean.
- `GET /api/source-status` returns service metadata.
- `GET /health` returns v0.3.0.
- Preview home page returns 200.
- Production promotion remains a separate explicit gate.
