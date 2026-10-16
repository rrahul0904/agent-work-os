# Research OS Phase A — Nebius AI Builder intake

Source tracker: #211 — Nebius AI Builder post → 7-project AI Engineering Portfolio Pack

## Status

`IMPLEMENTATION_STARTED / TARGETED_TESTS_GREEN / PROVIDER_RUNTIME_NOT_CONNECTED / CI_PENDING / UAT_NONE / DEPLOYMENT_NONE`

This slice intentionally contains no web-search provider, model provider, external write, deployment, or autonomous side effect.

## Goal

Create the smallest deterministic Research OS kernel that can later power the Deep Research recipe in the AI Engineering Lab while preserving Agent Work OS evidence, replay, and verification principles.

## Phase A contracts

- `research-brief/v1`
- `research-plan/v1`
- `evidence-item/v1`
- `evidence-ledger/v1`
- `claim-verification/v1`
- `research-receipt/v1`

## Invariants

1. Same canonical input produces the same digest.
2. A changed/tampered brief cannot reuse its previous digest.
3. Evidence has an explicit source class: `primary | independent | community | derived`.
4. Evidence stance is explicit: `supports | contradicts | context`.
5. Contradictions are preserved, not silently discarded.
6. Missing evidence references fail closed.
7. A claim with only context evidence is not treated as supported.
8. Research completion is represented by an immutable receipt bound to the brief, plan, evidence ledger, and verification digests.
9. This package grants no network, provider, filesystem mutation, Git mutation, deployment, or other effect authority.

## Current deterministic flow

```text
ResearchBrief
  -> deterministic ResearchPlan
  -> EvidenceItems
  -> EvidenceLedger
  -> claim/evidence verification
  -> ResearchReceipt (verified | blocked)
```

## Targeted test evidence before branch commit

Six local Node tests were executed against the implementation code before it was committed:

1. research brief and plan are deterministic;
2. evidence ledger sorts items and produces stable digest;
3. unsupported claim blocks the research receipt;
4. supported claim with contradiction remains visible and verified;
5. missing evidence ID fails closed;
6. tampered brief digest is rejected.

Result: `6 passed / 0 failed`.

This is targeted implementation evidence only. It is not repository-wide CI, runtime/UAT, preview, or production proof.

## Next slice

After repository CI validates Phase A:

1. add bounded `research-source-adapter/v1` interfaces;
2. add fixture search adapters before live web search;
3. enforce `maxQueries`, `maxEvidenceItems`, and `maxClaims` during execution;
4. add source freshness and source-quality scoring as evidence metadata, never authority;
5. add citation spans / claim-to-source anchors;
6. integrate with Agent Evaluation Harness #111;
7. compare single-agent vs multi-agent research under equal budgets;
8. only then attach live search/model providers behind existing Agent Work OS policy and receipt boundaries.

## Non-claims

- no LangChain/Open Deep Research parity;
- no external model/search provider connected;
- no web research executed by this package;
- no hosted runtime;
- no browser UAT;
- no deployment;
- no SHIPPED claim.
