# Build receipt — Research Ledger v0.3

- Donor: `VikingOwl91/research-bench`
- Classification: donor/reference → existing Research Ledger / Learn Anything capability
- Clean-room: yes
- Canonical branch: `rea/researchbench-convergence`
- v0.3 implementation adds durable captures, snapshot/version graph, replay/diff, portable `research-ledger/notebook.v1` import/export, PDF page-marker provenance, bounded public-URL freshness checks, SSRF/private-network refusal, portable Node routing and CSP hardening.
- Required code gate: `npm run check` + repository CI on the exact final SHA.
- Deployment gate remains separate: exact-SHA live preview and verification of `/`, `/health`, `/api/research`, `/api/source-status`.
- Vercel/Railway account limits are external shipping blockers; no live deployment is claimed until those gates pass.
