# Research Ledger v0.2 acceptance

## Functional
- Upload TXT/MD/CSV/HTML and extract text locally.
- Upload PDF via browser PDF.js adapter and index extracted page text.
- Persist documents in IndexedDB across reloads.
- Run local passage search without an API key.
- Ask a question and get an extractive grounded brief when live AI is unavailable.
- In live mode, send only the retrieved passages to `/api/research`.
- Click evidence IDs to open exact passages.
- Generate Summary, FAQ, Study Guide and Podcast transcript outputs.
- Play podcast transcript with browser SpeechSynthesis.
- Export JSON/Markdown and Agent Work OS handoff JSON.
- Detect local evidence-set changes with SHA-256 hash comparison.

## Safety / privacy
- No passive browsing capture.
- No document upload to provider unless passage retrieval selects bounded text and live generation is configured.
- No source HTML execution.
- Server evidence list and per-passage character counts are bounded.

## Release gate
- `npm run check` passes.
- Vercel preview is READY.
- `GET /api/research` returns 200 with `live` boolean.
- Preview home page returns 200.
