# REA intake — JustEvery / Contract-Driven SaaS Factory (2026-10-18)

**Canonical tracker:** [#274](https://github.com/rrahul0904/agent-work-os/issues/274).
**Source:** https://www.reddit.com/r/buildinpublic/s/HYlf1VdmKj → https://www.reddit.com/r/buildinpublic/comments/1x7z7nv/open_sourced_my_saas_i_spent_6_years_building_now/
**Owner of resulting module:** `rrahul0904/agent-work-os`. **Route:** donor/reference integrated in REA + Shipping OS. **Do not create 51 new repos.**

## Public evidence and confidence

- Author `u/withmagi` on 17 October 2026 states approximately 50 open-source products exist, roughly ten relatively mature, and a process of distilling completed agent sessions into short, periodically edited instructions. **These are self-reported claims, not independent validation.**
- https://justevery.com/products lists 51 named products. Its catalogue currently places **31** in ordinary groups and **20** under “Coming soon”; the homepage has stale-looking text saying **30** available and **21** forthcoming. The counted catalog snapshot is [JSON](./just-every-catalog-2026-10-18.json). Listing ≠ successfully deployed or production-qualified.
- https://justevery.com/process (14 October 2026) describes versioned promises in `CONTRACT.md`, tagged tests, adverse/fault scenarios, and release entries for intentional promise changes, with upstream + fork contract reconciliation.
- Upstream inspected: [just-every/run-lamp at v1.4.0](https://github.com/just-every/run-lamp/tree/v1.4.0) has `CONTRACT.md`, `BASELINE.md`, `seed.json`, `RELEASE.json`, `AGENTS.md`, and `tests/e2e/app-api.test.mjs`. `PAGE-006` preserves truthful degraded state; `RELEASE.json` records a 60s→240s deadline change, including the single-run limitation of its stress measurement. The public essay must not be mistaken for a test receipt.
- Core donors: [Magi](https://github.com/just-every/magi) (isolated controller/agents, browser bridge, Postgres), [Task](https://github.com/just-every/task) (reflection, cost and model rotation), [Ensemble](https://github.com/just-every/ensemble) (multi-provider LLM layer), [Every Code](https://github.com/just-every/code) (Codex fork, autonomous drive, browser, multi-agent).
- Default-branch SHA observations on 18 Oct 2026: run-lamp `5b2eada313aff6f519622e9c5338981a1c38ced5`; magi `4b2bffdb5fbf3a7371820dda024eaf81ce44654d`; code `41f66ca5d6193b32703333923c8158af12c5657a`. Lamp's *inspected files* use tag `v1.4.0`; tag hash must be captured before any stronger binary comparison.

## Rights and trust boundary

JustEvery asserts MIT for app repos, and Magi advertises MIT. Every Code is Apache-2.0 inherited from Codex. **Check each upstream LICENSE, NOTICE, assets and transitive code separately**; top-level marketing copy is not a substitute for provenance. New code in this branch is independently written from public observed behavior, not upstream implementation. No tokens, credentials, privileged host execution, external writes or deployment permission granted by a retrieved site.

## REA capability decomposition and routing

| Observed behavior | Existing owned capability | Action |
| --- | --- | --- |
| numbered promise clauses and test mapping | REA BehaviorSpec and verification #111 | BUILD independent static registry and test-map gate |
| release semantic diff with recorded owner intent | Shipping OS and governance #177 | NEXT: signed override/approval workflow and versioned records |
| deliberate dependency failure testing | independent Inspector, replay & benchmark | NEXT: executable negative-path tests and exact-SHA receipts |
| reconcile local owner divergence on upstream changes | clean Context Pack #115 and REA #88 | NEXT: triple-compare upstream/local/current |
| agent retrospective and bounded instruction compaction | Agent Work OS supervisor / durable memory | DONOR, do not maintain hidden chain-of-thought |
| Magi/Code agent delegation, sandbox, browser and model selection | existing runner, provider registry, worktree isolation | DONOR, no duplicate agent framework |
| 51 apps replacing SaaS platforms | REA product discovery / App Inventory | CATALOGUED ONLY; never assume parity or maturity |
| Lamp/Uptime/Oncall/Spool/Evidence | Shipping OS observability and proofs | selectively borrow behavior and quality cases |
| Vector/Nook/Cradle/Slate/Chest | Work Board / Research OS | selectively borrow workflow/UX insights |
| HappyToHelp/Mango/Orbit/Penny | Creator/support workflows | optional future triage, not four new repos |

## Owned architecture

```
Reddit/catalog/repos (untrusted, tagged) -> REA #88 evidence receipts
    -> BehaviorSpec / ArchitectureSpec / trusted Context Pack
    -> Promise Registry (this branch: static clauses/coverage/diffs)
    -> Supervisor + bounded Builder + isolated worktree
    -> independent Inspector #111 (actual runtime, fault injection, replay)
    -> Shipping OS (exact-SHA CI, preview/UAT, authorized production, health)
    -> immutable receipts -> tracker status update
```

## Implemented slice

- `packages/portfolio-contracts/src/index.js`: independent deterministic Markdown clause reader, stable ID validation, duplicate/malformed rejection, added/changed/removed diff, missing/unknown test links and explicit approval metadata check.
- `scripts/portfolio-contracts.mjs`: read-only audit command:
  `node scripts/portfolio-contracts.mjs CONTRACT.md mappings.json [previous-CONTRACT.md approvals.json]`
- `npm run test:portfolio-contracts` runs fixture tests, including adverse cases.
- **The gate is intentionally *static only*.** `MAPPED_UNVERIFIED` does not mean tests executed. `verification=NOT_RUN` and `shipping=NOT_AUTHORIZED` cannot be upgraded by this CLI.

## Build / UAT / shipping contract

- [x] Resolved source, author claims, source examples, license boundary, catalog 51 entries
- [x] Canonical repo routing; no pre-existing JustEvery/Magi issue in repo at intake
- [x] Static Promise Registry module, CLI, 8 local passing unit tests
- [ ] Exact branch-head GitHub CI verified
- [ ] REA evidence/BehaviorSpec adapter and evidence digest
- [ ] Associate promise IDs with **actually executed** test files and trusted CI receipts
- [ ] Fault injection, adversarial cases, replay and donor/owned differential benchmark
- [ ] Authenticated owner approval record & non-repudiable release semantics
- [ ] Browse selected apps, audit each repo/license and qualify real maturity
- [ ] Preview UAT and explicitly approved production release
- [ ] Deploy same tested SHA, confirm health checks, attach receipts, update tracker

**No phase beyond static prototype should be marked SHIPPED based on this documentation alone.**
