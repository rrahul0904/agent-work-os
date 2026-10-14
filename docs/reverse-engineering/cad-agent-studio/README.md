# CAD Agent Studio — REA dossier

Tracking: #179. Branch: `rea/cad-agent-studio`.

## Target identity
- Reddit target: `r/SideProject` post "Made an app where an AI agent does the CAD for me" (2026-10-14 capture).
- Public reference implementation: `Kai-Jungsthoefel/SOMA`, observed at prototype version 0.8.0 in its public README.
- Upstream license: GPL-3.0-or-later. Our repository is MIT.

## Clean-room rule
Upstream code is evidence, not implementation input. Do not copy source code, internal names, UI artwork, or undocumented implementation fragments into this repository. Reconstruct capabilities from observable behavior/public documentation and implement independently. Record dependencies and license obligations before adding any CAD/FEA engine.

## Evidence classes
- **OBSERVED** — directly present in the Reddit post or public repository documentation.
- **DERIVED** — architectural conclusion based on observed behavior.
- **HYPOTHESIS** — plausible design awaiting runtime/source-independent verification.
- **UNKNOWN** — not yet established.
- **VERIFIED** — reproduced by our independent implementation/tests.

## Capability map
| Capability | Evidence | Decision |
|---|---|---|
| Existing CLI agent edits parametric CAD code | OBSERVED | MATCH + harden |
| Parametric Python/CadQuery workflow | OBSERVED | MATCH behind engine adapter |
| 3D visualization | OBSERVED | MATCH |
| Point/measure/draw feedback | OBSERVED | MATCH with typed feedback packet |
| Version history and restore | OBSERVED | MATCH with immutable build DAG |
| Parameters/sliders | OBSERVED | MATCH |
| Overhang/wall-thickness analysis | OBSERVED | MATCH later |
| FEM | OBSERVED | ADAPT behind solver boundary; never trust LLM math |
| Agent-specific built-in intelligence | OBSERVED absent | OMIT: keep provider-neutral |
| Deterministic geometry assertions | DERIVED from comment risk | IMPROVE and make mandatory |
| Build provenance/replay receipts | Our roadmap | NEW / enterprise differentiator |
| Sandboxed no-egress execution | Our roadmap | NEW / enterprise differentiator |

## Product thesis
The sellable product is not "AI writes CAD." It is a governed parametric engineering workspace where any coding agent may propose model code, but deterministic geometry systems prove dimensions/topology and a replayable receipt records exactly what was built.

## Roadmap status
- P0 evidence/spec: **IN PROGRESS**
- P1 deterministic core + browser workbench: **IMPLEMENTED ON BRANCH; CI NOT YET CERTIFIED**
- P2 CadQuery/OpenCascade worker + STEP/STL: pending
- P3 agent adapters, annotation, immutable history: pending
- P4 manufacturing analysis + FEA adapters: pending
- P5 desktop packaging/signing: pending
- P6 enterprise tenancy/policy/audit: pending
- P7 Shipping OS exact-SHA certificate: pending
