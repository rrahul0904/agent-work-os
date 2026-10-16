# Research Ledger v0.3 acceptance

## Functional browser surface
- Upload TXT/MD/CSV/HTML and extract text locally.
- Upload PDF via browser PDF.js adapter and index extracted page text.
- Persist documents in IndexedDB across reloads.
- Run local passage search without an API key.
- Ask a question and get an extractive grounded brief when live AI is unavailable.
- In live mode, send only the retrieved passages to `/api/research`.
- Click evidence IDs to open exact passages.
- Generate Summary, FAQ, Study Guide and Podcast transcript outputs.
- Play podcast transcript with browser SpeechSynthesis.
- Export JSON/Markdown.
- Detect local evidence-set changes with SHA-256 hash comparison.

## v0.3 provenance / replay
- Every grounded research result can be persisted as an integrity-hashed snapshot.
- A snapshot records its parent snapshot IDs, document revisions/content hashes, claim hashes, evidence-set hash, decision state and gaps.
- Version graphs reject duplicate IDs, unknown parents, self-parenting and cycles.
- Snapshot comparison reports document, claim, evidence, gap and decision changes deterministically.
- Replay receipts bind an ancestor→descendant path to graph, snapshot and diff hashes.
- Tampering with replay or handoff payloads invalidates their receipt hashes.
- Browser history survives reload through a separate IndexedDB version-history store.
- A user can branch the next research run from an older snapshot without overwriting history.

## Governed Agent Work OS handoff
- Browser export uses `research-version-graph/v1` and `agent-work-os/research-handoff/v1`.
- Handoff binds the accepted conclusion to the exact snapshot, evidence-set hash and graph hash.
- Handoff carries open gaps and recommended next moves instead of hiding uncertainty.
- Bounded execution may auto-advance reversible work.
- External writes, merge, production deployment, credential changes and billing changes remain explicit approval gates.

## Safety / privacy
- No passive browsing capture.
- No document upload to provider unless passage retrieval selects bounded text and live generation is configured.
- No source HTML execution.
- Server evidence list and per-passage character counts are bounded.
- AI-chat imports are context-only unless independently verified.
- Cross-workspace evidence references are rejected by the governed kernel.

## Verification gate
- Repository-root `npm test` passes, including version graph / replay / handoff integrity tests.
- Repository-root `npm run acceptance` passes.
- `labs/research-ledger/npm run check` passes syntax checks for wrapper, preserved v0.2 app, v0.3 history, canonical contract adapter, API and portable runtime plus API smoke tests.
- CI is green on the exact PR head SHA.
- Preview deployment is built from that exact SHA and reaches READY/SUCCESS.
- `GET /api/research` returns 200 with a `live` boolean without exposing credentials.
- Preview home page returns 200 and renders the Research Ledger notebook and Version graph controls.
- `/health` returns 200 on the portable runtime target when that target is used.
- The exact deployed SHA, deployment ID/URL, checks and timestamp are recorded in `BUILD_RECEIPT.md`.
- Production promotion remains a separate Shipping OS gate. A successful build or preview alone is not production certification.
