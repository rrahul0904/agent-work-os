# REA Dossier — Reddit n8n target `vVrgxzx1Yy`

Status: `SOURCE_IDENTITY_BLOCKED`
Added: 2026-10-14
Source supplied by user: `https://www.reddit.com/r/n8n_ai_agents/s/vVrgxzx1Yy`

## Why this dossier exists

This source is part of the canonical n8n commercialization/reverse-engineering program. The user explicitly requested that it be added to the existing n8n inventory and reverse engineered end to end using the project roadmap + REA.

The Reddit short-share URL does not currently resolve to a canonical `/comments/<post-id>/...` permalink through the available web/search surface, and an exact-url search of prior project conversations found no earlier copy of this specific share token. Therefore the source identity is not being guessed.

This target is tracked now, but it is **not yet counted as a new commercial lineage** until source identity and deduplication are proven.

## Canonical roadmap / REA execution state

| Phase | Required output | State |
|---|---|---|
| 0. Source/Target Identity | canonical permalink, title, author, post date, outbound links, screenshots/video/GitHub/site references | BLOCKED on short-share resolution |
| 1. Evidence & Capability Discovery | post body, media, comments, external docs/site/repo, capability map, observed UX/API contracts | NOT STARTED — identity required |
| 2. Provenance / Rights Boundary | author/source ownership, license, redistributability, donor vs clean-room boundary | NOT STARTED |
| 3. Behavioral Decomposition | triggers, inputs, state, decisions, tools, side effects, retries, approvals, outputs | NOT STARTED |
| 4. Architecture Reconstruction | control plane, workflow plane, data plane, model/tool plane, observability, secrets | NOT STARTED |
| 5. Failure & Safety Analysis | timeouts, rate limits, hallucination boundaries, idempotency, replay, HITL, blast radius | NOT STARTED |
| 6. Product Gap Analysis | weaknesses from source + comments, production gaps, missing enterprise controls | NOT STARTED |
| 7. Clean-room Product Design | independent product requirements, differentiators, interfaces, schemas, workflow graph | NOT STARTED |
| 8. Implementation Plan | phased repo changes, n8n JSON/custom code/services, test fixtures, CI, docs | NOT STARTED |
| 9. Verification | import validation, deterministic tests, provider sandbox/E2E, failure injection, receipts | NOT STARTED |
| 10. Packaging / Commercialization | SKU, buyer, outcome, pricing tier, demo, storefront assets, support boundary | NOT STARTED |
| 11. Shipping Gate | exact SHA, evidence receipt, rollback/replay, release decision | NOT STARTED |

## Evidence log

1. User-supplied source URL is recorded verbatim.
2. Direct web retrieval of the Reddit short-share URL returned no canonical target.
3. Exact-token web search did not surface a matching indexed post.
4. Prior-conversation search found other recent `r/n8n_ai_agents` sources (`Q8aK460wi8`, `Q2YrhKo0Sd`) but **not** `vVrgxzx1Yy`; therefore this cannot be assumed to be the Bigfoot automation or the SEO workflow.
5. No title, node count, architecture, author, integration, or product claim has been inferred.

## Deduplication gates once identity resolves

Compare the target against all canonical lineages in `commercialization/n8n/MASTER_INVENTORY.md`, especially:

- FreeFlow / creator automation / faceless content lineages
- Lead scoring / LinkedIn engagement / Buyer Intent / Intent Revenue OS
- Sentinel reliability/runtime
- Research Agent OS
- Restaurant AI OS
- AP MatchFlow / BillingOps
- AgencyOS / MedFlow / RestoFlow / LeadGen / ZedProp clean-room families

If behavior is materially the same, fold it into the existing lineage and add source evidence rather than create a duplicate SKU.

## Non-negotiable clean-room rules

- REA is an evidence/capability provider, not the authority.
- Agent Work OS owns orchestration, policy, approvals, provenance, receipts, replay and Shipping OS gates.
- No donor JSON/code/assets are copied into a commercial SKU without explicit compatible rights.
- Unknown provenance => reference only; independent implementation required.
- Credentials, tokens, account IDs, personal data and private endpoints must never enter the repository.
- No live provider writes or deployment claims without explicit gated verification.

## Planned deliverables after source identity is available

- `SOURCE_EVIDENCE.md`
- `CAPABILITY_MAP.md`
- `ARCHITECTURE.md`
- `WORKFLOW_DATAFLOW.md`
- `COMMENTS_AND_FEEDBACK.md`
- `GAP_ANALYSIS.md`
- `CLEAN_ROOM_PRD.md`
- `IMPLEMENTATION_PHASES.md`
- `TEST_MATRIX.md`
- `COMMERCIALIZATION.md`
- `RELEASE_RECEIPT.md`

## Current decision

`HOLD_NEW_SKU` — target is successfully captured, but creating a named SKU or claiming end-to-end reverse engineering before resolving the canonical source would violate the evidence-first/clean-room roadmap.
