# REA intake — Archify (2026-10-20)

## Decision
**DONOR/REFERENCE to Visual Intelligence issue #206**, with a narrow original VisualBench proof-shape module. Do not create a standalone Archify clone or a second technical diagram compiler. Canonical semantic diagram owner: Traceframe/DiagramSpec (RE-356); UI: Technical Visual Studio; cross-artifact workspace: issue #327; AWOS controls plans, grants, provenance, verification and releases.

Source: https://www.reddit.com/r/BestGitHubRepos/comments/1xb048k/ (post 1xb048k, by u/Artilas_Digital). Upstream: https://github.com/tt-a1i/archify, frozen main SHA **25cf37080fc8b1dbe758a4efc3935b55f3327083** (2026-10-19). Release **v3.2.0** published 2026-10-19. Source inspection performed through public GitHub repository metadata, manifest and documents. Independent upstream test suite, binary portability and browser visual quality have **not** been executed as part of this intake.

## Evidence ledger

| Claim | Classification | Evidence | Qualification |
| --- | --- | --- | --- |
| Node >=18, module-based repository | OBSERVED | upstream root package.json | Does not establish package installation success |
| MIT root license | OBSERVED | LICENSE | Includes tt-a1i and Cocoon AI copyright statements |
| Third-party logos, fonts and brand marks carry other rights | OBSERVED | THIRD_PARTY_NOTICES.md | In particular trademark policies, selected CC-BY(-NC/SA), OFL font subset, independently licensed Pele; no unconditional redistribution |
| Schemas for architecture, class, dataflow, ERD, lifecycle, sequence, timeline, tree, waterfall, workflow, and explainer | OBSERVED | archify/schemas directory | Schemas exist; fidelity not independently proven |
| Renderer-backed diagrams, CLI entrypoints and sample output | OBSERVED | archify/renderers, archify/bin, examples | No vendor lock-in should be introduced in our canonical IR |
| JSON diagnostics, finalize and last-good transactional delivery | DOCUMENTED / CODE SURFACES OBSERVED | archify/SKILL.md; references/delivery-contract.md; bin/finalize.mjs and renderer shared modules | Upstream claims full browser checks; not certified by our Inspector |
| Git-pinned repository source range evidence | DOCUMENTED | references/repository-authoring.md and renderers/shared/repository-evidence.mjs | Need independent checkout and line-byte verification for our product |
| v3.2.0 one-page explainer, panel patch, browser exports | RELEASE DOCUMENTED | GitHub v3.2.0 release notes | Newer functionality not necessarily represented in Reddit summary |
| 86k stars | REDDIT SNAPSHOT | Reddit post and upstream metadata | Volatile popularity, not a quality acceptance metric |

## Functional decomposition

1. **Inputs** — natural language, structured requirements, repository and revision; optional Markdown explainer with cited sources.
2. **Authoring** — LLM/agent chooses diagram family and generates typed JSON IR; coordinates/routing must be a reproducible authored choice, not fabricated runtime topology.
3. **Schema/layout** — typed structure, validation, edge paths, clearance, text and route constraints, diagnostic classifications.
4. **Evidence** — repository identity and commit-bound source ranges; never claim source truth from a declared file path alone.
5. **Artifact** — portable standalone HTML/SVG, viewer interactions and exports.
6. **Validation/delivery** — staged candidate, machine-readable failures, validation gate, controlled publication, recovery and last-good preview.
7. **Explainer** — answer-first Markdown plus grounded panel content with optional native diagrams, source links and export.

### Boundary / data flow
User instruction or permitted repository -> REA intake and source snapshot -> PromptSpec / evidence-classified ArtifactPlan -> canonical DiagramSpec (Traceframe) -> renderer adapters -> staged artifact -> independent VisualBench structural/visual/replay/export checks -> Inspector receipt -> explicit publish approval -> Shipping OS gated distribution.

The LLM never supplies an authoritative verification receipt or direct release permission. A source reference stored in JSON is merely **declared** until a separate verifier checks the file contents and range at the exact commit.

## Gap matrix and priority

| Priority | Work | Acceptance |
| --- | --- | --- |
| P0 | Original pure diagram proof-shape verifier | Deterministic sha256 of candidate, fixed schema/type, unique IDs, no dangling edges, bounded graph, safe relative source paths and line ranges, never an approval. Negative tests are compulsory. |
| P0 | Traceframe/DiagramSpec mapping | Same semantic nodes/relationships and provenance across input/output, no silent dropping. Owner remains RE-356. |
| P0 | Evidence truth gate | Fetch exact checkout SHA, confirm referenced file bytes, line range, content binding and no secret disclosure. Record sha of referenced bytes. |
| P1 | VisualBench render quality | Golden fixtures in all diagram families, collision / routed clearance, mobile legibility, color/contrast, keyboard and screenreader checks, browser screenshot diffs. |
| P1 | Reproducible exports | Standalone HTML/SVG/PNG/PDF and semantic equivalent export, native/editable PowerPoint bridge, verify underlying object editability rather than raster appearance. |
| P1 | Multi-artifact explainers | Synchronized text/table/diagram/document references, inline source cards, versioned panel updates; source-based retrieval separate from explanation inference. |
| P2 | Revision-aware diagram diffs | On PR changes, minimize affected nodes and show added/removed/changed elements with evidence; no fabricated causal impact. |
| P2 | Controlled delivery | Scoped output-path grants, atomic candidate publication, rollback, path alias/symlink/hardlink tests, last-good preview, no network or production writes by default. |

## Clean-room and security

- **Do not copy upstream app source or styling**; independently define DiagramSpec, tests and receipts. MIT reuse would be possible with mandatory attribution, but donor/clean-room boundaries remain preferable.
- Logos, third-party fonts and packaged marks are **excluded** from owned implementation until independently cleared; vendor trademarks are not available merely because the root is MIT.
- Model-authored labels and markdown are untrusted; escape rendered content and disable script/unsafe URLs in later renderer adapters.
- Local and remote repository read effects require scoped permission; external HTTP links cannot be treated as valid source proof merely from string shape.
- Publication, push, deployment and external calls require separate policy grants and immutable evidence. No unchecked auto-install of the upstream skill.
- Do not conflate **shape validated**, **source bytes verified**, **visually verified**, **native editable**, **browser tested**, **integrated**, **deployed**, **shipped**.

## Implementation in this research branch

- `packages/visualbench/src/diagram-proof.mjs` is an **original**, read-only, in-memory proof-shape validator. It checks declared structure and simple provenance shapes; does not perform Git reads, geometry, browser, rendering or I/O.
- `packages/visualbench/test/diagram-proof.test.mjs` covers negative and positive structural cases; root npm test now includes it.
- Hash receipts intentionally return `sourceEvidence: DECLARED_UNVERIFIED`, `browserEvidence: NOT_TESTED` and `publishAuthorized: false` even for valid input.
- CI passing on this branch proves only this isolated contract plus existing test suites. It does not certify release.

## REA state

As of intake: upstream source and legal provenance **researched**; bounded original verifier **implemented in research branch**; browser/live product interaction, source-byte verification, Traceframe integration, exports, end-to-end UAT, shipping approval and deployment remain **unverified/not done**. See issue #341.
