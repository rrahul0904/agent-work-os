# Acceptance gates

## P1
- Node 22: core tests pass with no third-party runtime dependency.
- Canonical JSON/digests are ordering-independent.
- Invalid geometry is rejected before build.
- Measurement assertions decide receipt validity.
- Agent commands are argv arrays with `shell:false`.
- Browser workbench changes parametric dimensions and emits a verification/feedback preview.

## P2
- Worker runs a pinned CAD engine in an isolated environment.
- Example enclosure builds to canonical BREP/mesh outputs.
- STEP + STL export round-trip checks pass.
- Bounding-box and selected-distance assertions come from the CAD kernel.
- Timeout, crash, malformed model, path traversal and no-egress tests pass.

## Ship gate
- Fresh checkout/build from candidate SHA.
- Unit + integration + adversarial + replay tests green.
- Desktop/web artifact digest recorded.
- UAT examples build and export correctly.
- Exact-SHA Shipping OS receipt is immutable and links evidence IDs and dependency/license inventory.
