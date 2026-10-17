# Build receipt — Research Ledger v0.3

- Donor: `VikingOwl91/research-bench`
- Classification: donor/reference → existing Research Ledger / Learn Anything capability
- Clean-room: yes
- Canonical branch: `rea/researchbench-convergence`
- Canonical PR: `#219`

## Implemented product surface

- Local PDF/TXT/Markdown/CSV/HTML source notebook with exact passage IDs.
- IndexedDB persistence, grounded lexical retrieval and optional bounded provider synthesis.
- Opt-in multilingual neural semantic search using a browser Web Worker.
- Semantic model provenance is pinned to `Xenova/multilingual-e5-small` revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`, Transformers.js `3.8.1`, `q8`, normalized mean pooling and E5 `query:` / `passage:` prefixes.
- Semantic indexing is bounded to 240 chunks with deterministic round-robin source coverage and lexical/semantic top-result overlap diagnostics.
- Summary, FAQ, Study Guide and cited two-host Podcast Studio outputs.
- Durable captured sources, up to 50 research snapshots, replay/diff and evidence hashes.
- Portable `research-ledger/notebook.v1` import/export and Agent Work OS handoff.
- PDF page-marker provenance and local/remote evidence drift controls.
- Bounded `/api/source-status` public-URL freshness checks.
- Portable Node routes for `/`, `/health`, `/api/research` and `/api/source-status`.

## Hardening receipts

- A dedicated path-scoped `research-ledger-ci` workflow now runs `npm run check` independently of the parent Agent Work OS suite, preventing unrelated root-test timing failures from suppressing the Research Ledger verification signal.
- Exact semantic implementation head `a1b9b748eabb385bbefb527b85429e0690153297` passed independent product push run #3 and PR run #4.
- API/security, browser schema, semantic contract and portable-runtime smoke gates all passed on that implementation head.
- Browser storage has one v3 compatibility floor for `documents`, `snapshots` and `captures`, loaded before the main app. The schema contract executes the compatibility shim in a Node VM and proves legacy v2 opens are promoted to v3, required stores are provisioned, unrelated databases are untouched and newer schema versions are not downgraded.
- Semantic contract tests prove exact model/runtime pins, deterministic source coverage, worker-only passage embedding, q8 + normalized mean pooling, E5 prefixes and lexical-overlap diagnostics.
- Portable runtime smoke tests boot the real Node server and verify health/API routes, CSP, all shipped CSS/JS/semantic assets, HEAD behavior and refusal to expose non-public package files.
- The portable static server uses an explicit asset allowlist including semantic core/controller/worker files.
- URL freshness checks refuse credential-bearing, local/private and IP-literal URLs; DNS answers are checked for private/non-routable destinations.
- HTTP/HTTPS freshness connections are pinned to the already-vetted DNS answer, closing the validation-to-connect DNS-rebinding window. Redirects are independently revalidated and re-resolved.
- Freshness response sampling remains bounded to 64 KiB with request timeouts and a maximum of eight URLs per request.

## Privacy / dependency boundary

- Semantic search is opt-in. No embedding model is downloaded until the user requests semantic search.
- Source passages are read from local IndexedDB and passed to the same-origin Web Worker; they are not sent to `/api/research` or another application backend for embedding.
- The browser downloads/caches the pinned Transformers.js/model assets from the explicitly allowed CDN/model hosts. Model download traffic is distinct from notebook-content traffic.
- Semantic vectors currently live in worker memory and can be deterministically rebuilt from the local evidence set.

## Honest non-claims

- Neural multilingual semantic search is implemented, but the default grounded-brief retrieval path still uses the existing deterministic lexical ranking. Semantic retrieval has not yet been promoted to the brief generator's primary ranking path.
- The semantic index deliberately caps coverage at 240 chunks and reports partial coverage for larger notebooks.
- Podcast playback uses browser SpeechSynthesis; downloadable encoded audio is not claimed.
- Full browser automation/capacity benchmarking remains optional hardening, not represented as completed.

## Gates

- Required product code gate: path-scoped `research-ledger-ci` / `npm run check` on the exact final branch SHA.
- Parent repository CI remains useful but can fail independently because it covers unrelated Agent Work OS systems.
- Deployment gate remains separate: exact-SHA live preview and verification of `/`, `/health`, `/api/research`, `/api/source-status` and browser assets.
- Vercel/Railway account limits remain external shipping blockers; no live deployment is claimed until those gates pass.
