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
- URL freshness checks refuse localhost/private hostnames, credential-bearing URLs and all IP-literal URLs.
- DNS results are rejected when any answer targets private, link-local, multicast, benchmark or documentation/non-routable network ranges covered by the boundary.
- Freshness HTTP/HTTPS connections are pinned to the DNS answer that was already vetted, preventing a second resolver lookup from bypassing the validation decision.
- Every redirect is revalidated and receives a new vetted/pinned DNS resolution.
- URL freshness fetches use bounded 64 KiB response sampling, at most eight URLs per call and request timeouts.
- Portable notebook import validates schema and bounded document/snapshot counts before restore.
- Portable static hosting exposes only the explicit shipped browser asset allowlist.

## Verification
- Repository CI must execute `npm run check` from `labs/research-ledger` on the exact implementation SHA.
- Product syntax checks cover `db-schema.js`, app/completion modules, APIs, portable server and test programs.
- API/security smoke tests cover provider-disabled mode and the public-URL boundary.
- The browser storage schema contract executes `db-schema.js` in a VM and proves v2→v3 compatibility, required-store provisioning, unrelated-database isolation and no downgrade of newer schemas.
- Portable runtime smoke tests boot the real Node server and verify `/`, `/health`, `/api/research`, `/api/source-status`, all shipped CSS/JS assets, CSP, HEAD behavior and package-file non-exposure.

## Release gate
- Vercel or alternate preview is READY for the exact SHA.
- `GET /api/research` returns 200 with `live` boolean.
- `GET /api/source-status` returns service metadata including DNS-pinning support.
- `GET /health` returns v0.3.0.
- Preview home page and all referenced browser assets return 200.
- Production promotion remains a separate explicit gate.
