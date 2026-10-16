# Research Ledger v0.2 acceptance

## Functional
- Upload TXT/MD/CSV/HTML and extract text locally.
- Upload PDF through a browser PDF.js adapter and index extracted page text.
- Persist documents in IndexedDB across reloads.
- Run local passage search without an API key.
- Ask a question and get an extractive grounded brief when live synthesis is unavailable.
- In live mode, send only the retrieved passages to `/api/research`.
- Click evidence IDs to open exact passages.
- Generate Summary, FAQ, Study Guide and Podcast transcript outputs.
- Play podcast transcript with browser SpeechSynthesis.
- Export JSON/Markdown and Agent Work OS handoff JSON.
- Detect local evidence-set changes with SHA-256 hash comparison.

## Safety / privacy
- No passive browsing capture.
- No whole-notebook provider upload by default.
- No source HTML execution.
- Server evidence count and passage character sizes are bounded.
- Live model configuration requires both `OPENAI_API_KEY` and explicit `OPENAI_MODEL`.

## Release gate
- `npm run check` passes.
- Vercel preview reaches READY.
- `GET /api/research` returns 200 and a `live` boolean without exposing secrets.
- Preview home page returns 200 and contains local notebook controls.
- Deployed source SHA is recorded.
