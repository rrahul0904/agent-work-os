# REA intake — Anthropic Knowledge Work Plugins

Intake: 2026-10-18 (America/New_York) | Governance: [#288](https://github.com/rrahul0904/agent-work-os/issues/288)

**Routing:** DONOR / REFERENCE → existing Agent Work OS Capability Fabric. No standalone product repository. Downstream role consumers: Creator Console (marketing), ADE OS (data), Agent Work OS Work Queue (product management).

## 00 — Source identification and provenance

- Supplied Reddit shortlink: https://www.reddit.com/r/SATNA_PROJECT/s/4I7FVuwumT
- Resolved post: https://www.reddit.com/r/SATNA_PROJECT/comments/1x9d2r1/
- Poster: u/ZookeepergameMost817, discussing agency knowledge-work plugins.
- First-party upstream: https://github.com/anthropics/knowledge-work-plugins
- Exact inspected source SHA: `33eeda1e8fd856455b05479d13a0f85b5f803744` (commit dated 2026-10-16).
- Root license is Apache-2.0; third-party partner-built catalog entries and external tool/services may require separate licenses or ToS review.
- Limit: public README, source files, license, marketplace, marketing role manifests/skills and connector files were inspected. Private deployments, real user efficacy, runtime OAuth flows and proprietary SaaS backends were not observed.

## 01 — Observed mechanism (facts vs claims)

1. The root `.claude-plugin/marketplace.json` is the marketplace index, including local first-party packs and partner-built/external sources. External refs can be moving or separately licensed.
2. Role manifest `<role>/.claude-plugin/plugin.json` contains name, version, description and author.
3. Skills are Markdown with YAML frontmatter in `<role>/skills/<skill>/SKILL.md`; marketing role's current eight skills are `brand-review`, `campaign-plan`, `competitive-brief`, `content-creation`, `draft-content`, `email-sequence`, `performance-report`, `seo-audit`.
4. Marketplace docs describe slash command usage, but a separate `commands/` directory is not present/necessary for this inspected marketing pack.
5. `<role>/.mcp.json` lists HTTP MCP service endpoints and blanks/placeholders (e.g., Gmail and Google Calendar). No automatic authentication or successful connector operations are implied by their appearance.
6. `CONNECTORS.md` uses category-based placeholders (for example, `~~design`), separating domain intent from a specific vendor.
7. The marketing manifest version at the inspected commit is `1.2.0`. Public role examples include drafts, campaign plans, brand review and competitor/performance analysis; this is not proof of production delivery.

## 02 — Canonical ownership and delta

**Existing owned system:** `packages/capability-fabric/src/index.js` already implements neutral `CapabilitySpec`, harness profiles for Claude/Codex/Cursor/OpenCode/Antigravity/Copilot/Pi, compilation, deterministic receipts, REA import, registry and drift. Runtime verification, guarded installation and rollback are in `docs/CAPABILITY_FABRIC.md`. Real-binary certification for remaining runtimes is tracked in #259. Compiler support is not a runtime-certification claim.

**New missing capability:** ingest *sets of knowledge-work role skills* with exact-SHA evidence, explicit instruction-content approval, inert connector inventory, deterministic neutral conversion, source-path provenance and collision/path validation.

**Implemented bounded slice:** `packages/capability-fabric/src/role-pack.js` now exports `parseRoleSkill`, `inspectRolePack` and `importRolePack`; each converter feeds the existing `createCapabilitySpec` contract. Inputs are caller-supplied files. The inspector does not fetch, execute, install, register MCP or grant network permissions. Imports require `approveInstructions: true` and the source must be pinned, licensed and path-safe. Tests use *original synthetic skills*, not upstream instruction copying.

## 03 — Capability map

| Observed source domain | Owned integration lane | Priority |
|---|---|---|
| marketing / brand / campaigns | Creator Console: evidence-backed brief → draft → brand/claim QA → human approval | P0/P1 |
| plugin management | Agent Work OS Capability Fabric role-pack intake and registry | P0 |
| product management | Agent Work OS planning and Work Queue | P1 |
| data / SQL / validation | ADE OS, governed read-only analytics + test receipts | P1 |
| enterprise search / productivity | Agent Work OS Context & Knowledge layer | P1 |
| sales / support | Opportunity/Application Agent and support operations | P2 |
| finance / legal / HR / bio-research | comparison-only pending field-specific regulatory/privacy review | P2 |

## 04 — Security and clean-room gates

- Treat Reddit summaries as discovery leads, not evidence of functionality beyond upstream inspected files.
- Treat skill instructions as **untrusted data**. No automatic elevation into system policy, shell execution, or external connector invocation.
- Fail closed for floating `main`/untagged source SHA, invalid role paths, duplicate skill identity, unsupported licenses and malformed frontmatter.
- Enumerate `.mcp.json` connectors as `disabled-unreviewed` only. Never start stdio transport commands, send network calls, or copy connector definitions into neutral capability execution requirements.
- Keep brand guides and customer data tenant-scoped, minimum-permission, and separately approved. Drafts may be previewed; publish/send/CRM updates require human approval and durable receipts.
- Apache-2.0 for the root does not license unrelated partner packages or third-party assets; review per source.
- Preserve pinned upstream source SHA, path and license per capability. Maintain owned original implementation independent of Anthropic trademarks.
- Separate compile proof from real-harness native discovery and user task success.

## 05 — REA → implementation → shipping roadmap

- [x] Target resolved, canonical source/author identified and SHA pinned.
- [x] First-party marketplace / role / skill / connector architecture inspected.
- [x] Existing Agent Work OS capability ownership and overlap (#259) mapped.
- [x] Issue #288 + bounded research branch created.
- [x] Clean-room role-pack read-only inspector, approval-gated importer, multi-harness synthetic tests authored.
- [ ] Exact-head CI outcome, policy review and branch PR receipt.
- [ ] Evaluate third-party catalog entries individually for license/integrity risk.
- [ ] Add upstream pinned-fixture acquisition under explicit import/license review (no automatic execution).
- [ ] Work OS authenticated API/UI for displaying role packs, risk details and approvals.
- [ ] Tenant-scoped context overlays + versioned brand rules and approved factual claims.
- [ ] Creator Console vertical: brief → campaign draft → brand and claims gate → export/publish with approval.
- [ ] ADE OS safe data role pack; domain-specific correctness/lineage/SQL policy tests.
- [ ] Real harness native-discovery tests, browser/mobile usability, tenant integration and regression replay.
- [ ] Hosted preview, UAT, rollback/observability and gated production shipping receipts.

**Current status:** Research and first functional source module; not feature-equivalent, not deployed, not production-verified. No final signoff without exact-SHA green CI and runtime/approval evidence.
