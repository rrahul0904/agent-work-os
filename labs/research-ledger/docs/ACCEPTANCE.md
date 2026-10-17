# Research Ledger v0.3 acceptance

## Functional
- Upload TXT/MD/CSV/HTML and extract text locally.
- Upload PDF via browser PDF.js adapter and index extracted page text.
- Persist documents in IndexedDB across reloads.
- Persist explicit captured sources across reloads.
- Run deterministic local lexical passage search without an API key.
- Run opt-in multilingual semantic passage search in a browser Web Worker without sending notebook passages through the application API.
- Semantic retrieval uses pinned `Xenova/multilingual-e5-small` revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78` through Transformers.js `3.8.1`, quantized `q8`, normalized mean-pooled embeddings, and the model-required `query:` / `passage:` prefixes.
- First semantic use explicitly downloads/caches the pinned browser model; lexical search remains available if model loading or embedding fails.
- Semantic indexing is bounded to 240 chunks and uses deterministic round-robin source coverage rather than silently selecting only early documents.
- Semantic results preserve exact passage IDs and report top-result overlap with lexical retrieval as a diagnostic.
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
- Semantic passage text is read from local IndexedDB and transferred only to the same-origin browser Web Worker for embedding.
- The semantic controller does not call application APIs; the model runtime downloads model/runtime assets only after explicit semantic-search use.
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
- Independent path-scoped `research-ledger-ci` must execute `npm run check` from `labs/research-ledger` on every relevant push/PR so an unrelated Agent Work OS test cannot hide the product signal.
- Product syntax checks cover `db-schema.js`, app/completion modules, semantic modules/worker, APIs, portable server and test programs.
- API/security smoke tests cover provider-disabled mode and the public-URL boundary.
- The browser storage schema contract executes `db-schema.js` in a VM and proves v2→v3 compatibility, required-store provisioning, unrelated-database isolation and no downgrade of newer schemas.
- The semantic contract verifies exact model/runtime pins, source-coverage capping, `query:` / `passage:` prefixes, q8 + mean pooling + normalization, worker-only passage embedding and lexical-overlap diagnostics.
- Portable runtime smoke tests boot the real Node server and verify `/`, `/health`, `/api/research`, `/api/source-status`, all shipped CSS/JS/semantic assets, CSP, HEAD behavior and package-file non-exposure.
- Exact semantic implementation head `a1b9b748eabb385bbefb527b85429e0690153297` passed `research-ledger-ci` push run #3 and PR run #4.

## Honest boundaries
- Semantic search is an opt-in search/inspection lane. Grounded brief creation still uses the existing deterministic lexical retrieval path by default; semantic ranking is not falsely claimed as the brief generator's primary retriever yet.
- The browser/model cache may persist downloaded model assets, but semantic vectors are currently held in worker memory and can be rebuilt from the local notebook.
- The semantic coverage cap is 240 chunks; larger notebooks expose the coverage count rather than implying the entire corpus was embedded.

## Release gate
- Vercel or alternate preview is READY for the exact SHA.
- `GET /api/research` returns 200 with `live` boolean.
- `GET /api/source-status` returns service metadata including DNS-pinning support.
- `GET /health` returns v0.3.0.
- Preview home page and all referenced browser assets, including semantic worker/controller modules, return 200.
- Production promotion remains a separate explicit gate.
