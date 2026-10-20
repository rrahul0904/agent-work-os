# REA research intake: Profullstack engineering ecosystem

- Intake date: 2026-10-20 ET
- User target: https://profullstack.com/
- Governance: https://github.com/rrahul0904/agent-work-os/issues/318
- Classification: **DONOR/REFERENCE** into existing **Agent Work OS**. No new standalone repo.
- Work state: **research/spec only**. No implementation, install, CI test, merge, or deployment claimed.

## Source identity and pinned evidence

| Surface | Evidence | Scope / limitation |
| --- | --- | --- |
| Agency/engineering model | https://profullstack.com/ | Senior engineer with supervised coding agents; claims review, test and CI before shipping |
| Stack selections | https://profullstack.com/stack | Web-app, API-service, CLI/TUI, desktop, mobile, shared-library and systems combos; owner-prescribed choices are not requirements for our platform |
| Product directory | https://profullstack.com/docs/directory | 73 listed at inspection; docs overview currently says 72; count drift is present |
| Stack builder | https://profullstack.com/stack/build | Surface and module selection; boilerplate files, `src/core`, `AGENTS.md`, `CLAUDE.md`, CLI/MCP/desktop/mobile options; `mobile` notes-only |
| Skill distribution | https://profullstack.com/blog/one-skill-md-for-every-coding-agent | Multi-harness skill conventions, installer; article dated 2026-10-03, remote script **not run** |
| Shared package | https://github.com/profullstack/stack/commit/89d4c5a7e74d677395841557776bec5dbc730be6 | `@profullstack/stack` 0.4.0; MIT LICENSE at `main`; subpath modules and fleet catalog (README says 62 services as of 2026-10-06) |
| Distribution platform | https://github.com/profullstack/sh1pt/commit/e6b90a07da881986a34a69283f4cea645e428d46 | `sh1pt` repo, MIT LICENSE; README declares **alpha**; API/CLI/multi-platform target matrix and real/manual/constrained status; do not infer all targets operational |
| Existing owned product | https://github.com/rrahul0904/agent-work-os | Canonical work/control plane; README describes local daemon + Codex, control API, acceptance tests and several planned waves |

**Rights:** `profullstack/stack/LICENSE` and `profullstack/sh1pt/LICENSE` both inspected and contain MIT notices (Copyright © 2026 Profullstack, Inc.). No license claim for their entire portfolio; validate each target's exact repository and files before copying. This dossier independently describes architecture patterns and does not reproduce proprietary branding/code.

**Claims vs verification:** Marketing claims about number of active repos, products, metrics, delivery speed, agent supervision and uptime are author statements. Source repos expose code/README claims; no first-party private deployment, runtime fleet or full acceptance was tested. A generated starter file is not a verified integrated product.

## Reconstructed functional seams

1. **Human-supervised work**: work request → assigned senior reviewer/supervisor → coding agents → tests/review/CI → approved release. **Unknown**: private scheduler, delegated-agent recovery internals, budget enforcement, review provenance.
2. **Project recipes**: choose product type → choose one or more surfaces → select house modules → generate shared core with adapter shells and agent instructions. **Unknown**: generator's complete export/install correctness across all surface combinations. Mobile explicitly notes-only.
3. **House packages**: cross-product modules with stable package subpaths and independent concerns. **Unknown**: operational cross-repo governance and full compatibility matrix.
4. **Shipping manifest**: source/config → build → lint/dry-run → target-specific submission/provisioning → status/rollback; README distinguishes live/manual/constrained pathways. **Unknown**: exercised, credentialed production target parity.
5. **Agent-facing discovery**: stable Markdown/JSON instructions; CLI and MCP where appropriate; service catalog and APIs. **Unknown**: authenticated discovery semantics, security boundaries and runtime status.

## Mapping into already-owned capabilities

| Observed donor idea | Owner | Existing overlap | Scoped delta |
| --- | --- | --- | --- |
| Human-supervised agent fleet | Agent Work OS (#267), Workbench/Queue | Local daemon sessions, work item lifecycle, execution fabric in progress | Bounded supervised run graph, live progress, independent review evidence, resume and budget |
| One skill for many harnesses | Capability Fabric (#259) | Neutral CapabilitySpec/HarnessProfile; adapter certification incomplete | Packaging consistency UX and new harness support **only after** #259 certification |
| Stack builder / Chovy | Solution Factory lane in Agent Work OS | Project recipes and build/ship program | Neutral `stack-recipe/v1` compiler and deterministic skeleton acceptance |
| Shared reusable packages | Capability registry | Registry/installed artifact provenance | Dependency/license catalog and safe template resolver; avoid proprietary coupling |
| sh1pt | Shipping OS | Existing gated shipping architecture | Manifest adapter readiness matrix, dry-run, manual dependency checkpoints, exact release receipts |
| QAaaS and review | Evaluation/QA | Evaluation harness and policy gates | Independent scenario regression on generated vertical slice |
| Fleet/service directory | REA/service registry | Source/provenance/capability inspection | Read-only catalog ingestion with freshness, evidence and drift receipts |

## Narrow first owned implementation: Recipe-to-Verified-App

**Non-goals:** Clone the consultancy website, reproduce payment/crawler monetization, force Turso/Next/Bun/Railway onto existing projects, rewrite current auth, execute upstream installer, open broad production write scopes, and build 73 products.

**Proposed contract** `stack-recipe/v1`:
- `recipeId`, `revision`, `sourceEvidence[]`, `licenseEvidence[]`
- `productIntent`, `surfaces[]` (web/api/cli/mcp/desktop/mobile), `platforms[]`
- `corePackage`, `modules[]`, `adapters[]`, `constraints[]`
- `templateRevision`, `generatorRevision`, `outputManifest[]`
- `validationProfile`, `executionPolicy`, `releasePolicy`
- `unsupported[]` and per-surface status (generated, tested, not-supported).
- No secrets in manifest or generated repo; all external reads/writes explicit and policy-gated.

**P1 proof** (single synthetic demo): Generate a bounded API + web (+ optional CLI) fixture app from a reviewable local recipe. Run offline deterministic generation twice and compare output manifests/hashes. Verify only authorized paths, no overwrite, no secrets, no unapproved network or external MCP. Run typecheck and tests. Attach to a WorkItem and isolated workspace; use certified harness only, require human-reviewed diff and record a **dry-run** Shipping OS receipt. Do not deploy.

## Verification gates / falsification tests

- Re-run same `recipeId+revision+templateRevision` → byte-identical output hashes.
- Reject invalid surface combos, unrecognized module, path traversal, preexisting-file overwrite and symlinks.
- Wrong/upstream-unlicensed file cannot be imported; each included module has SPDX/provenance receipts.
- Worker/agent interruption, duplicate completion event and stale WorkItem version are handled without false success.
- Native harness / skill discovery must be certified (#259), not inferred from compiled output.
- Pre-release pipeline fails if any native tests, runtime smoke, security policy, human approval or receipts are missing.
- Publication credentials, financial effects, external SaaS writes and deployments remain disabled until explicit approval.

## Next inspection targets

`moshcode`, `Chovy`, `QAaaS`, `@profullstack/stack/fleet` service descriptors, generator source and release/CI code. Locate individually verified public repositories/commits/licenses before code-level conclusions. Then update the matrix with actual runnable CLI and tests, not only product copy.

## Operational status

Research artifact only. P0 evidence first pass complete; P0 product code/runtime scrutiny and P1 implementation **not complete**. Track decisions and verified links in issue #318. No new repository, upstream installer execution, imported code or production change.
