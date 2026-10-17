# AI Engineering Lab / Research OS — REA provenance and roadmap receipt

Canonical tracker: #211  
Implementation PR: #232  
Branch: `feature/ai-engineering-lab-research-os`

## Placement

This work remains inside Agent Work OS. REA is an evidence/provenance provider only; it does not own orchestration, authorization, external effects, completion truth, deployment, or Shipping OS gates.

## Donor / comparator pin

Behavior/reference donor: `langchain-ai/open_deep_research`

- role: comparator / workflow donor only;
- exact inspected snapshot: `1b7d2e80db9faa586165c60e09096dbbfd483a64`;
- license at that snapshot: MIT;
- repository state observed during this intake: archived;
- direct source copied into owned implementation: **none**;
- owned implementation strategy: independent clean-room contracts and tests.

The donor may inform behavior questions such as configurable search/model providers and research workflow decomposition. It does not define Agent Work OS authority, evidence schemas, UI, or release truth.

## Roadmap state after this slice

`SOURCE -> EVIDENCE -> RECONSTRUCTION -> SPECIFICATION -> IMPLEMENTATION_STARTED`

Completed in this branch:

- `ai-project-recipe/v1` and `ai-project-spec/v1` deterministic contracts;
- explicit authority policy: network only through declared adapters, external writes forbidden by default, deployment only through Shipping OS;
- Research OS recipe bound to #211;
- fixture-only `research-search-adapter/v1` with `networkAccess=false`;
- bounded query/evidence collection;
- `rea-evidence-observation/v1` classification: `OBSERVED | DERIVED | HYPOTHESIS | UNKNOWN`;
- source quality and publication/retrieval metadata;
- provider/source revision provenance;
- source-span retention for citation verification;
- fail-closed rule preventing `HYPOTHESIS`/`UNKNOWN`-only evidence from verifying factual claims;
- deterministic collection receipt and replay digest.

Still pending:

- live web/search adapter behind explicit network authority;
- source freshness policy and contradiction scoring beyond the current evidence classes;
- report synthesis/writer;
- direct integration with Agent Evaluation Harness #111 receipts;
- live runtime/browser UAT;
- Shipping OS verification;
- deployment.

## Reuse boundaries

- Agent Evaluation Harness #111 remains the canonical evaluation/release-evidence layer.
- Local Knowledge / grounded-answer work #174 remains the canonical retrieval/source-bound answer substrate.
- Research OS consumes those capabilities; it must not fork duplicate evaluation or local-search runtimes.

## Non-claims

This slice is not production-ready, does not use live providers, does not perform external writes, and does not authorize deployment. A passing local deterministic suite proves only this bounded contract/kernel behavior.
