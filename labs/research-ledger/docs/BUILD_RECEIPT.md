# Research Ledger v0.3 build receipt

## Identity / clean-room
- Donors: SourceFrame public product behavior + `VikingOwl91/research-bench` public behavior/repository evidence.
- Classification: donor/reference → existing Research Ledger / Learn Anything capability; no new standalone clone.
- Clean-room boundary: yes; donor source, CSS, assets, prompts, tests and generated build output were not transplanted.
- Canonical working branch: `feature/research-ledger-v0.3`.
- Canonical draft PR: `#223` (`feat: Research Ledger v0.3 provenance replay and governed handoff`).
- PR mergeability observed after the v0.3 convergence: mergeable `true`.

## Convergence / implementation receipts
- v0.2 browser product head used for convergence: `f4125b77727e713e005262cbfa65b7f50139a57b`.
- Governed ResearchBench evidence-kernel head used for convergence: `b75c0dff566d5d3798080e59ae6cfc7e70f85dab`.
- Two-parent convergence merge commit: `4ca3a8f5b8b10091915c35009c8190c5e3fddb25`.
- v0.3 verified runtime/code SHA: `5cf72f275084a77c4229ff7c2dd0f619a54c3078`.

## v0.3 scope verified at that SHA
- Integrity-bound research snapshots and SHA-256 validation.
- Acyclic research version graph with explicit parents, roots and heads.
- Deterministic document/claim/evidence/gap/decision diffs.
- Replay receipts bound to graph, path, snapshots and diff hash.
- Canonical `research-version-graph/v1` JSON Schema.
- Canonical `agent-work-os/research-handoff/v1` contract + JSON Schema.
- Handoff approval gates for external writes, merge, production deploy, credential changes and billing changes.
- Browser IndexedDB version history, replay summary and branch-from-old-snapshot UX layered over the preserved v0.2 runtime.
- Bounded HTTPS remote-source freshness checker with content hashes, redirect provenance, byte/media limits and SSRF/private-network refusal.
- Signed freshness states: `baseline`, `unchanged`, `changed`, `unreachable`.
- Repository CI now executes the Research Ledger local syntax/API/browser-contract smoke gate.

## Verification
- GitHub Actions workflow: `ci` run `1421`.
- Exact tested code SHA: `5cf72f275084a77c4229ff7c2dd0f619a54c3078`.
- Result: **SUCCESS**.
- Repository `npm test`: passed, including research replay/handoff/freshness integrity and adversarial tests.
- Repository `npm run acceptance`: passed.
- Research Ledger `npm run check`: passed after repairing the browser-contract assertion caught by the newly added CI gate.
- The earlier strengthened-gate run correctly failed on that test assertion while repository tests remained green; the test was repaired rather than the gate being weakened.

## Deployment receipt
- Vercel project: `research-ledger` (`prj_pW2WzuGQK5SjVWRBLv8z9WZnCgwV`).
- Requested source: exact verified SHA `5cf72f275084a77c4229ff7c2dd0f619a54c3078` from `feature/research-ledger-v0.3`.
- Corrected preview deployment request: blocked externally with HTTP `402 payment_required`.
- Vercel resource/code: `api-deployments-free-per-day` — more than 100 API deployments in the Hobby daily allowance; retry-after reported as 86400 seconds.
- No Vercel deployment ID or live URL was created for this SHA.
- Existing Git-linked project currently shows no deployment for the v0.3 branch.
- Railway remains an unsuitable fallback under the previously observed expired trial / plan requirement unless the account state changes.

## Release state
**VERIFIED / DEPLOYMENT BLOCKED — EXTERNAL VERCEL ACCOUNT QUOTA.**

No live URL is claimed. The code/acceptance gates are green; Shipping OS must keep deployment and production state open until an exact-SHA preview exists, its home/API checks pass, and the deployment receipt is recorded. Production promotion remains a separate approval gate.
