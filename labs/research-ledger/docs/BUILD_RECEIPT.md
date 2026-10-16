# Research Ledger v0.2 build receipt

- Donor: `VikingOwl91/research-bench`
- Classification: donor/reference → existing Research Ledger / Learn Anything capability
- Clean-room boundary: yes; donor source, CSS, assets, prompts and tests were not transplanted
- Canonical integration branch: `rea/researchbench-convergence`
- Owned implementation commit: `c1b4e7330bf8c07a84ab26d35287d664e9e67a49`
- Portable runtime commit: `16956921de9a8194d1a0c7e5fcda0513c96679a4`
- Local verification: `npm run check` passed (syntax + API smoke tests)
- Runtime smoke: `/health` returned 200/ok; `/api/research` returned 200 with `live:false`; home rendered `LOCAL-FIRST RESEARCH MEMORY`
- Vercel release attempt: blocked externally by Hobby API deployment quota (`402 payment_required`, `api-deployments-free-per-day`, more than 100 deployments/day)
- Vercel CLI fallback: unavailable in the execution runtime because no authenticated CLI session is present
- Railway fallback: blocked externally because the connected Railway trial has expired and requires plan selection
- Release state: **DEPLOYMENT BLOCKED — EXTERNAL ACCOUNT/QUOTA GATES**. No live URL is claimed for this SHA.
- Production gate remains: publish this exact canonical SHA, verify home + `/health` + `/api/research`, then record the live receipt before marking the PR ready.
