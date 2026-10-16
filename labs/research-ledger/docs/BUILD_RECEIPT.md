# Build receipt — Research Ledger v0.3

- Donor: `VikingOwl91/research-bench`
- Classification: donor/reference → existing Research Ledger / Learn Anything capability
- Clean-room: yes
- Canonical branch: `rea/researchbench-convergence`
- Canonical PR: `#219`

## Implemented product surface

- Local PDF/TXT/Markdown/CSV/HTML source notebook with exact passage IDs.
- IndexedDB persistence, grounded local retrieval and optional bounded provider synthesis.
- Summary, FAQ, Study Guide and cited two-host Podcast Studio outputs.
- Durable captured sources, up to 50 research snapshots, replay/diff and evidence hashes.
- Portable `research-ledger/notebook.v1` import/export and Agent Work OS handoff.
- PDF page-marker provenance and local/remote evidence drift controls.
- Bounded `/api/source-status` public-URL freshness checks.
- Portable Node routes for `/`, `/health`, `/api/research` and `/api/source-status`.

## Hardening receipts

- Repository CI now runs `npm run check` inside `labs/research-ledger`; a green parent-repository CI result therefore proves the product-specific gate too.
- Browser storage has one v3 compatibility floor for `documents`, `snapshots` and `captures`, loaded before the main app. The schema contract executes the compatibility shim in a Node VM and proves legacy v2 opens are promoted to v3, required stores are provisioned, unrelated databases are untouched and newer schema versions are not downgraded.
- Portable runtime smoke tests boot the real Node server and verify health/API routes, CSP, all shipped CSS/JS assets, HEAD behavior and refusal to expose non-public package files.
- The portable static server uses an explicit asset allowlist including both `styles.css` and `completion.css`.
- URL freshness checks refuse credential-bearing, local/private and IP-literal URLs; DNS answers are checked for private/non-routable destinations.
- HTTP/HTTPS freshness connections are pinned to the already-vetted DNS answer, closing the validation-to-connect DNS-rebinding window. Redirects are independently revalidated and re-resolved.
- Freshness response sampling remains bounded to 64 KiB with request timeouts and a maximum of eight URLs per request.

## Honest non-claims

- Current local retrieval is deterministic lexical/hybrid relevance, not a neural multilingual embedding model.
- Podcast playback uses browser SpeechSynthesis; downloadable encoded audio is not claimed.
- Full browser automation/capacity benchmarking remains optional hardening, not represented as completed.

## Gates

- Required code gate: product `npm run check` + repository CI on the exact final branch SHA.
- Deployment gate remains separate: exact-SHA live preview and verification of `/`, `/health`, `/api/research`, `/api/source-status` and browser assets.
- Vercel/Railway account limits remain external shipping blockers; no live deployment is claimed until those gates pass.
