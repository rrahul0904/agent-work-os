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
- Grounded briefs default to lexical ranking and now offer explicit **Hybrid RRF · experimental** retrieval.
- Hybrid brief mode fuses lexical and semantic rank positions with deterministic reciprocal-rank fusion (`k=60`), preserves exact passage IDs, records model/coverage/overlap/fallback metadata in the brief lineage, and falls back to lexical ranking on any semantic/runtime failure.
- Hybrid mode reconciles persisted semantic capture IDs back to current exact local passages before rendering evidence.
- Summary, FAQ, Study Guide and cited two-host Podcast Studio outputs.
- Durable captured sources, up to 50 research snapshots, replay/diff and evidence hashes.
- Portable `research-ledger/notebook.v1` import/export and Agent Work OS handoff.
- PDF page-marker provenance and local/remote evidence drift controls.
- Bounded `/api/source-status` public-URL freshness checks.
- Portable Node routes for `/`, `/health`, `/api/research` and `/api/source-status`.

## Hardening receipts

- A dedicated path-scoped `research-ledger-ci` workflow runs `npm run check` independently of the parent Agent Work OS suite, preventing unrelated root-test timing failures from suppressing the Research Ledger verification signal.
- Exact semantic implementation head `a1b9b748eabb385bbefb527b85429e0690153297` passed independent product CI.
- Exact hybrid implementation head `92292a5fedf416b1a6254eec25bbb96154873d54` passed `research-ledger-ci` run #24 with every verification step successful.
- Browser storage has one v3 compatibility floor for `documents`, `snapshots` and `captures`, loaded before the main app. The schema contract executes the compatibility shim in a Node VM and proves legacy v2 opens are promoted to v3, required stores are provisioned, unrelated databases are untouched and newer schema versions are not downgraded.
- Semantic contract tests prove exact model/runtime pins, deterministic source coverage, worker-only passage embedding, q8 + normalized mean pooling, E5 prefixes and lexical-overlap diagnostics.
- Hybrid contract tests prove deterministic RRF behavior, lexical-default delegation, hybrid opt-in wiring, keyboard interception, automatic lexical fallback, classic-script state visibility and portable runtime inclusion.
- Portable runtime smoke tests boot the real Node server and verify health/API routes, CSP, all shipped CSS/JS/semantic/hybrid assets, HEAD behavior and refusal to expose non-public package files.
- The portable static server uses an explicit asset allowlist including semantic core/controller/worker and hybrid bridge files.
- URL freshness checks refuse credential-bearing, local/private and IP-literal URLs; DNS answers are checked for private/non-routable destinations.
- HTTP/HTTPS freshness connections are pinned to the already-vetted DNS answer, closing the validation-to-connect DNS-rebinding window. Redirects are independently revalidated and re-resolved.
- Freshness response sampling remains bounded to 64 KiB with request timeouts and a maximum of eight URLs per request.

## Privacy / dependency boundary

- Lexical brief retrieval is the default and requires no model download.
- Semantic search and hybrid brief retrieval are opt-in. No embedding model is downloaded until the user explicitly selects a semantic path.
- Source passages are read from local IndexedDB and passed to the same-origin Web Worker; they are not sent to `/api/research` or another application backend for embedding.
- When live provider synthesis is enabled, hybrid mode sends only the final bounded fused evidence list to the existing generation endpoint.
- The browser downloads/caches the pinned Transformers.js/model assets from the explicitly allowed CDN/model hosts. Model download traffic is distinct from notebook-content traffic.
- Semantic vectors currently live in worker memory and can be deterministically rebuilt from the local evidence set.

## Honest non-claims

- Hybrid RRF is implemented but remains explicitly experimental; lexical is still the default retrieval mode.
- Automated tests verify fusion/integration correctness, not real-model retrieval-quality uplift. No accuracy gain is claimed until representative browser benchmarks demonstrate it.
- The semantic index deliberately caps coverage at 240 chunks and reports partial coverage for larger notebooks.
- Podcast playback uses browser SpeechSynthesis; downloadable encoded audio is not claimed.
- Full browser automation/accessibility/capacity benchmarking remains optional hardening, not represented as completed.

## Gates

- Required product code gate: path-scoped `research-ledger-ci` / `npm run check` on the exact final branch SHA.
- Parent repository CI remains useful but can fail independently because it covers unrelated Agent Work OS systems.
- Deployment gate remains separate: exact-SHA live preview and verification of `/`, `/health`, `/api/research`, `/api/source-status` and browser assets.
- Vercel/Railway account limits remain external shipping blockers; no live deployment is claimed until those gates pass.
