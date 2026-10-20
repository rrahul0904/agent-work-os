# REA dossier: DevScribe AI — engineering artifact workspace

Date: 2026-10-20
Status: research + isolated fixture implementation; NOT integrated, released, or certified.
Issue: https://github.com/rrahul0904/agent-work-os/issues/327
Parent: https://github.com/rrahul0904/agent-work-os/issues/206
Owner: Agent Work OS + RE-356 Traceframe/DiagramSpec + Technical Visual Studio.
Disposition: DONOR/REFERENCE to existing product; no standalone DevScribe clone.

## Evidence and rights ledger

| Finding | Class | Evidence | Limit |
|---|---|---|---|
| An AI assistant creates round-robin load-balancer notes and diagram files | OBSERVED AUTHOR CLAIM | https://www.reddit.com/r/coolgithubprojects/comments/1xaqv70/ | Screenshot/post, not independently replayed; no GitHub source linked |
| One prompt creates e-commerce folders, docs, editable architecture diagram, schema, Compose, APIs, JSON, Kafka/SQS and terminal runbook | OBSERVED AUTHOR CLAIM | https://www.reddit.com/r/SideProject/comments/1x9cn46/ | Public demo assertion, not independently replayed |
| Offline local-first docs, diagrams, API/DB/code/terminal and plugin workspace on macOS/Windows/Linux | OBSERVED VENDOR CLAIM | https://devscribe.app/ | Documentation, not installation/runtime QA |
| Linked artifact block behavior | OBSERVED VENDOR CLAIM | https://devscribe.app/docs/devscribe-doc/tips-guide/ | Internal contract unknown |
| Public release repo, not application source | OBSERVED GITHUB | https://github.com/avinashiitb/Devscribe-releases at b7f1d8ffe4f995a549f21892681239df7cdfe068 | README only; no main-app open-source license |
| Adjacent document-editor component | POSSIBLE RELATED COMPONENT | https://github.com/avinashiitb/document-editor at 2ce777bd45c104551d5cd0e52d8abd3125d8d928 | No license clearance, no code copied |
| devscribeai.com | POSSIBLE NAME COLLISION | https://www.devscribeai.com/ | Different-domain documentation SaaS; do not conflate |
| Main application internals, stack, security, model/prompts and copyright license | UNKNOWN | no verified source | Do not assert or copy |

Do not copy brand/UI, proprietary source, plugin internals, prompts, assets or binaries. The Phase-A implementation is independently authored from behavioral goals. Treat vendor claims as unverified until run.

## Reconstructed owned workflow — conceptual, NOT alleged upstream internals

Prompt + optional authorized repository evidence → governed ArtifactPlan → typed dependency graph → generator workers → Markdown and structured DiagramSpec → link/semantic integrity check → staged workspace preview → independent review → permission-gated execution/publishing → exact-SHA verification and Shipping OS.

## Component ownership

- Agent Work OS supervisor/REA: source receipts, grants, sandbox, execution, policy and proof gates.
- RE-356 Traceframe/DiagramSpec: semantic editable diagram geometry, typed nodes/edges/ports, exports.
- Technical Visual Studio #206: web UI, Prompt Studio, edit/preview, export certification, VisualBench.
- New narrow Engineering Artifact Workspace module: typed document/diagram bundle, references, hashes and safe staging.
- Existing Context Pack, Repo Atlas and PR Lens: optional grounding and PR-diff-driven regeneration.
- Future adapters: REST/OpenAPI, SQL/NoSQL, sample payloads, Kafka/SQS, Docker Compose, terminal; generated drafts are inert, not automatically executed.

## MATCH / IMPROVE / NEW / OMIT

MATCH: one prompt to notes + editable graph; link docs with diagrams, APIs, DB schemas and runbooks.
IMPROVE: typed ArtifactBundle, hashes, bounded inputs, versioned references, preview, independent semantic checks.
NEW: source-grounded claims, change impact graph, selective regeneration, read-only repo intake, VisualBench editability and replay.
OMIT: proprietary UI clone, source/binary copying, assumed source license, unsafe implicit command/API/DB execution, unapproved deployment.

## Phase A — bounded vertical implementation on isolated research branch

The module packages/engineering-workspace/src/artifact-bundle.js includes:
1. createRoundRobinFixture: deterministically creates Markdown technical notes and an editable node-edge graph.
2. createArtifactBundle + verifyArtifactBundle: enforce clean-room provenance, allowed types, safe artifact paths, bounded size, integrity hashes and valid references.
3. verifyDiagram: reject dangling or duplicate node IDs, invalid edge types and routes targeting unhealthy backends.
4. simulateRoundRobin: healthy-only ordering and explicit no-healthy-backend outcome for an HTTP 503 boundary.
5. Test suite: happy path, stable digests, health rotation, tamper, missing refs, invalid paths, banned executable types, invalid edge/health semantics.

Scope exclusion: no LLM, graph canvas, disk writes, remote calls, DB or terminal execution, backend API or deployment. Prototype does not prove final customer workflow.

## Phase B — integration NOT DONE

1. Reconcile existing Traceframe branch implementation before designing a DiagramSpec adapter (no duplicate renderer).
2. Add typed plans for API requests, database schemas, JSON payloads, compose and command drafts; explicit tool grants separate from text generation.
3. Add multi-artifact dependency graph, cross-reference resolution, conflict/drift detection and repo-backed evidence.
4. Agent runs through authorized capability fabric; artifact mutations staged and independently inspected.
5. Browser canvas editing, round-trip tests, SVG/PDF exports, semantic diagram review.

## Phase C — acceptance + shipping NOT DONE

Golden e-commerce pipeline fixture; invalid and contradictory API/schema/Kafka/SQS cases; independent Inspector; exact-head CI; model and prompt injections; symlink, credential and command privilege denials; restart/replay; browser UAT. Separate approvals for live writes, pushes, merges and deploy. Never say production-ready without exact-SHA Shipping OS certification.

## Threat model

Untrusted prompts and repositories may contain prompt injection, fake architectural claims, malicious terminal/SQL instructions and unsafe file paths. Phase A has no filesystem/network access and rejects executable artifact types; future adapters must be sandboxed with allowlisted workspace paths, permission scopes, irreversibility gates, audit, verified sources and symlink refusal.

## State matrix

- RESEARCHED: source URLs and classification captured.
- SPECIFIED: bounded bundle and safety contract authored.
- IMPLEMENTED: isolated Phase-A fixture and tests committed.
- TESTED: PENDING exact-head CI evidence.
- INTEGRATED: NOT DONE.
- DEPLOYED: NOT DONE.
- SHIPPED: NOT DONE.
