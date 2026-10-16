# ResearchBench donor attribution and clean-room boundary

## Reference

- Project: ResearchBench
- Repository: `VikingOwl91/research-bench`
- Surfaced from: Reddit r/SideProject share provided on 2026-10-16
- Donor license observed during REA review: AGPL-3.0
- Classification in Agent Work OS: donor/reference only

## What may inform the owned implementation

The Agent Work OS Research / Evidence Workspace may independently implement general product and architecture ideas observed from the reference, including local-first document processing, canonical source text, embeddings/retrieval, exact citation spans, source-backed generation, study artifacts, provider-neutral model access, and strong verification/testing patterns.

## What must not cross the boundary

Do not copy donor source code, tests, prompts, UI composition, assets, text, branding, or nontrivial implementation structure into the Agent Work OS codebase. Do not vendor, transpile, adapt, or mechanically translate AGPL implementation files into the permissively licensed/commercial core.

Comparison work should use independently authored fixtures and externally observable behavior. Public documentation can be retained as provenance evidence, but raw third-party bodies and donor implementation files are not implementation inputs.

## Owned improvement direction

The owned system separates structural evidence integrity from semantic entailment, adds deterministic receipts and source-revision fencing, and is intended to integrate with Agent Work OS policy, provenance, replay, verification, and Shipping OS rather than operate as a separate research authority.
