# Learn Anything Studio — governed REA dossier

Status: `IMPLEMENTED_CORE / PREVIEW_DEPLOY_PENDING / CERTIFICATION_PENDING`

## Target identity

Reference target: **Claudemy** (`assafkip/claudemy`, MIT), surfaced from the Reddit r/claudeskills post “Forget Udemy - I have Claudemy” on 2026-10-14.

Our product identity: **Learn Anything Studio**. This is an independent Agent Work OS implementation of the observable workflow ideas: source-backed micro-courses, short two-host-friendly scripts, compact practice cards, disagreement-aware research, and citation validation. It does not reuse the donor branding, page composition, prose, or implementation code.

## Canonical roadmap

Target/Source → Discovery → REA Investigation → Evidence → Understanding → Reconstruction → Specification → Improvement → Build → Verify → Compare → Deploy → Certify.

REA is the governed reverse-engineering provider/capability layer. Agent Work OS remains the authority for provenance, clean-room boundaries, orchestration, policy, verification, replay, deployment, and Shipping OS gates.

## Evidence classification

- **Observed** — the reference accepts a topic and builds a short course from researched public material.
- **Observed** — the reference targets roughly 12 short lessons, grouped into arcs, with dialogue scripts, lesson cards, a small practice, and a playbook.
- **Observed** — the reference actively searches for both agreement and credible disagreement rather than presenting a single-source summary.
- **Observed** — the reference limits research concentration to no more than three pages from one site and rejects lesson citations to pages that were not actually saved/read.
- **Observed** — its implementation supports an external TTS provider with local speech fallback.
- **Observed** — the Reddit description mentions NotebookLM while the repository implementation uses its own lesson/audio workflow. The discrepancy is retained as evidence rather than harmonized away.
- **Inferred** — the learning workflow does not intrinsically require Claude Code, one model provider, or one TTS vendor.
- **Verified in our build** — the repository now contains a provider-neutral course skill, machine-checkable course validator, browser Learning Studio, and CI tests for citation integrity and source concentration.

## Capability matrix

| Capability | Decision | Notes |
|---|---|---|
| Topic → researched micro-course | MATCH | Implemented as an Agent Work OS skill contract |
| Short lesson scripts | MATCH | 240–420 word quality range, not an artificial hard duration claim |
| Compact lesson cards + practice | MATCH | `idea`, `impact`, `tryIt`, `ruleToKeep` contract |
| 20–40 source research target | MATCH | Research guidance, adjusted when topic scope is smaller |
| Maximum three research pages/domain | MATCH | Enforced by validator |
| Agreement/disagreement mapping | MATCH | Explicit evidence ledger and split retention |
| Citation must map to actually-read source | MATCH + HARDEN | Machine-checked using source IDs and `status: read` |
| Sample lesson before full course | MATCH | `interactive` generation mode |
| Fully autonomous course creation | IMPROVE | `autopilot` mode adds self-review receipt instead of pretending user approval occurred |
| Single Claude execution environment | OMIT | Product is runtime/provider-neutral |
| Fixed ElevenLabs/macOS audio stack | IMPROVE | Audio is an adapter with explicit degraded text-only mode |
| Course manifest + evidence receipt | NEW | Enables audit, replay, enterprise review, and Shipping OS integration |
| Browser launch surface | NEW | Static Studio can launch a run through an Agent Work OS control plane or export/copy the exact instruction |
| Raw scraped pages in public repo | OMIT | Copyright-sensitive source bodies remain private working material |

## Clean-room and license boundary

The reference repository is MIT licensed. Even so, this implementation was authored independently around observable behavior and workflow concepts rather than copying the donor skill text, scripts, UI, assets, or branding. The source project and its license are acknowledged in `ATTRIBUTION.md`.

Public course artifacts may include source URLs and original analysis, but raw third-party article bodies are private working material by default and must not be committed merely because they were scraped for study.

## Product architecture

```text
Learn Anything Studio (browser)
        │
        ├── offline handoff: exact execution prompt
        │
        └── Agent Work OS /api/sessions
                    │
                    ▼
             connected agent runtime
                    │
           skills/learn-anything/SKILL.md
                    │
      ┌─────────────┼─────────────────────┐
      ▼             ▼                     ▼
 source discovery  evidence map       lesson generation
      │             │                     │
      └─────────────┴──────┬──────────────┘
                           ▼
                course-manifest.json
                           │
                           ▼
             validate-course.mjs gate
                           │
               ┌───────────┴───────────┐
               ▼                       ▼
          delivery pack         evidence-receipt.json
```

The browser does not contain an LLM credential or pretend to conduct research itself. It either launches a real connected Agent Work OS session or hands the exact governed instruction to the user.

## Current implementation slice

- `skills/learn-anything/SKILL.md`
- `skills/learn-anything/scripts/validate-course.mjs`
- `services/control-api/test/learn-anything.test.js`
- `apps/web/public/learn-anything/index.html`

Functional behaviors:

1. Course request captures topic, level, lesson count, source mode, optional expert, feedback mode, audio mode, and constraints.
2. Studio produces a visible execution blueprint without fabricating research output.
3. Studio can POST the generated instruction into the existing Agent Work OS session API when a reachable control plane, machine, and token are supplied.
4. Studio never persists the control-plane token in browser local storage.
5. The course contract uses stable source and lesson IDs.
6. A lesson citation to an unknown or unread source is a hard validation failure.
7. More than three research sources from one domain is a hard validation failure.
8. Agreement counts must be internally valid.
9. The skill requires an evidence receipt and keeps audio provider-neutral.

## Verification contract

Required before certification:

- feature branch is isolated from `main`;
- repository CI passes Node 22 tests and acceptance checks;
- `learn-anything.test.js` passes citation and source-diversity cases;
- public `/learn-anything/` route returns HTTP 200 over HTTPS;
- course request fields work on desktop and mobile-width layouts;
- execution prompt changes when user settings change;
- copy-prompt path works where clipboard permission is available;
- launch path reaches the Agent Work OS session API when an authorized control plane is supplied;
- invalid/missing connection fields fail visibly without claiming a run started;
- no model/TTS/control-plane secret is embedded in the deployed HTML;
- hosted artifact corresponds to the branch/commit being certified;
- browser UAT and production promotion remain distinct evidence gates.

## Improvement backlog

**P0 — real research execution receipt:** add a standard Agent Work OS task receipt for curriculum map, opened source IDs, claim/source edges, validator output, and delivered artifacts.

**P0 — source capability adapters:** reusable fetch/read adapters for HTML, RSS/Atom, sitemaps, public papers/docs, and user-provided material with robots/rate-limit awareness.

**P0 — audio contract:** provider adapter interface plus generated media metadata and real-duration recording in the manifest.

**P1 — saved courses:** durable course/project storage, version history, resumption, and shareable final artifacts without exposing private source cache.

**P1 — enterprise governance:** workspace source allowlists/denylists, approved-source policies, signed reviewer receipts, retention controls, SSO/RBAC, and organization templates.

**P1 — learning UX:** actual player, progress, transcript sync, practice completion, export packs, and optional spaced-recall prompts without coercive streak mechanics.

**P2 — evaluation:** factuality sampling, citation entailment checks, source diversity score, disagreement retention score, lesson completion feedback, and replay comparison between model/provider versions.

## Monetization shape

- **Free / open-source:** local skill, validator, execution blueprint, text lessons, local/private source workspace.
- **Pro:** hosted saved courses, premium TTS, synchronized player, exports, resume/history, richer source connectors.
- **Team / enterprise:** governed source policy, SSO/RBAC, audit receipts, private knowledge connectors, reviewer workflows, centrally managed model/TTS providers, analytics, and retention controls.

The sellable enterprise product is not “AI-generated podcasts.” It is governed, replayable learning-content production with verifiable source provenance and organization policy.

## Shipping posture

The current slice is appropriate for a public preview after CI and hosted-route verification. It is not yet certified as a fully autonomous research/course-production service until a real end-to-end course run, source-evidence receipt, audio adapter verification, and browser UAT have all been recorded against an exact commit SHA.
