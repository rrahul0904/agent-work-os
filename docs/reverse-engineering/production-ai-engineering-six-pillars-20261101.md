# Production AI Engineering — Six-Pillar REA / Roadmap Dossier

**Observed 2026-11-01. Lifecycle:** SOURCE_RESOLVED → REA_EVIDENCE_CAPTURED → PARTIALLY_IMPLEMENTED; **not shipped**.  
**Donor:** https://lnkd.in/p/gAgj62J9 (LinkedIn post by Shivani Virdi).  
**Type:** curated technical resources, **not** an application or a software repository.  
**Target home:** Agent Work OS, not a new product or clone.

## Evidence and access ledger

| ID | Class | Source | Claim / limitation |
| --- | --- | --- | --- |
| E-001 | OBSERVED | LinkedIn post above | Six areas: LLM fundamentals, production prompts, context engineering, agent harness, evaluations, observability. The post links to multiple independent references. |
| E-002 | OBSERVED | https://openai.com/index/harness-engineering/ | OpenAI describes repo-embedded knowledge, architecture enforcement, worktree isolation, UI/trace legibility, and corrective feedback loops in a specific agent-first engineering experiment; not universal proof of parity. |
| E-003 | OBSERVED | https://www.anthropic.com/research/effective-harnesses-for-long-running-agents | Anthropic describes initializer/worker role split, incremental progress receipts, feature-state files, and browser verification to address context handoff failures. |
| E-004 | OBSERVED | https://www.anthropic.com/research/effective-context-engineering-for-ai-agents | Context includes tools, history and retrieved data; context packing must prioritize high-signal material under finite budgets. |
| E-005 | OBSERVED | https://www.anthropic.com/research/demystifying-evals-for-ai-agents | Task/attempt/grader/trace/outcome distinctions; regression and capability evals; isolation, repeated trials, probabilistic grading limits, and end-state verification. |
| E-006 | REPOSITORY_OBSERVATION | https://github.com/rrahul0904/agent-work-os/issues/111 | Existing proposed multi-turn agent eval harness and receipts; do not introduce a competing evaluator. |
| E-007 | REPOSITORY_OBSERVATION | https://github.com/rrahul0904/agent-work-os/issues/177 | Existing reliability/governance control plane; reuse its role/grant/phase handoffs. |
| E-008 | REPOSITORY_OBSERVATION | https://github.com/rrahul0904/agent-work-os/issues/66 | Existing provider-neutral session telemetry proposal. |
| E-009 | REPOSITORY_OBSERVATION | https://github.com/rrahul0904/agent-work-os/issues/390 | Current production release is explicitly NO-GO; research/feature branches cannot advance launch. |
| E-010 | ACCESS_GAP | Shortened reference URLs embedded inside the LinkedIn post | Nested LinkedIn shortlinks did not independently resolve in this read-only inspection. Named topics were cross-checked against independently discoverable official sources; exact one-to-one link mapping remains unverified. |

All external materials are treated as **behavioral/design references**, not permission to copy source text, images, private prompts, implementation details, or branding. No commercial/closed-source extraction, bypass, login automation, or authenticated data collection performed.

## Portfolio routing and donor disposition

| Pillar | Existing owner | Decision | First proof |
| --- | --- | --- | --- |
| LLM fundamentals | Token Intelligence + model gateway | IMPROVE | provider-reported usage and context/cost provenance with missing/stale values |
| Production prompting | Agent Work OS, prompt-revision contract (this branch) | NEW thin kernel, then ADAPT into control plane | exact revision + eval suite + independent approval; stale changes rejected |
| Context engineering | Agent Work OS context/memory plane | IMPROVE | budget + origin/freshness receipts; prompt injection and stale context tests |
| Long-running harness | Agent Work OS mission/daemon + #177 | REUSE / IMPROVE | crash, restart, checkpoint, approval/revoke; side effects reconciled |
| Agent evaluations | #111 Agent Evaluation Harness | REUSE | scenario → deterministic/outcome grading → independent receipt → release gate |
| Observability | #66 session telemetry + trace plane | REUSE / IMPROVE | trace/event ID, model/tool usage provenance, redaction, unknown≠zero |

**Do not create:** standalone competing agent OS, separate eval dashboard, duplicate trace database, LMS clone, or copied curriculum. Any eventual learning material belongs in the existing Academy/Certification products, with original lessons and SME review.

## Original target workflow

```text
User task
  -> MissionContract / identity / exact capability grants
  -> PromptRevision + ContextManifest (pinned digests)
  -> Agent run (bounded turns, tools, effects, token budget)
  -> Signed / tamper-evident trace + usage provenance
  -> Independent EvalScenario / deterministic & probabilistic graders
  -> Inspect actual persistent effects + policy and recovery
  -> EvalReceipt / PromptApproval / ReleaseGate
  -> Staged activation with owner authorization and rollback
```

**Hard invariants:** a model cannot approve its own prompt, asserted tool calls do not prove tool effects, trace presence does not prove quality, missing telemetry is UNKNOWN rather than zero, a green mock test cannot prove real-provider billing or identity isolation, and no branch or CI result can self-certify production.

## Four-wave execution contract

### Wave 1 — REA intake, dedupe, typed contracts (this branch)
- [x] Resolve donor identity and public post.
- [x] Cross-check core harness/context/eval assertions against official primary sources.
- [x] Reuse existing Agent Work OS issues #111, #177, #66 and release gate #390.
- [x] Implement isolated `prompt-revision/v1` with deterministic canonical digest.
- [x] Implement **side-effect-free** staged-promotion eligibility predicate.
- [x] Add eight local regression/negative tests.
- [ ] Independent reviewer validates sources, decisions, and current main/head integration fit.
- [ ] Inspect official primary sources for every nested link once accessible and record immutable source versions.

### Wave 2 — Internal controlled vertical slice
- [ ] Persist prompt revisions immutably with tenant/project namespace and uniqueness constraints.
- [ ] Bind exact prompt, context, model, tool-contract and evaluator digests to session.
- [ ] Connect to existing #111 eval receipt and #177 role/approval policy; do not trust caller-supplied flags.
- [ ] Run a fake model/tool workflow: browser → API → persistence → inspect → receipt.
- [ ] Reject cross-tenant approvals, stale digests, unauthorized actors, tampered receipts and secret leakage.
- [ ] Explicit staging rollback to a previously approved revision; replay exact negative cases.

### Wave 3 — Reliability, context economics, observability
- [ ] Curate high-signal context with source/freshness and budget provenance.
- [ ] Add recovery checkpoint and post-effect reconciliation rather than blind retries.
- [ ] Normalize agent traces, tool/effect receipts and token/cost observations.
- [ ] Run 20–50 scoped eval tasks (as capacity permits), deterministic first; separately report probabilistic judges.
- [ ] Compare provider, model, prompt and context variants with exact versioned baselines.

### Wave 4 — Independent verification and gated adoption
- [ ] Exact-SHA CI, static/security review, adversarial prompts and role isolation tests.
- [ ] Independent browser end-to-end verification with durable persistence and actual effect checks.
- [ ] Real-provider tests only after data-retention, privacy, quotas and billing provenance approval.
- [ ] Review production hosting authorization, backup/restore, rollback and on-call.
- [ ] **Never deploy or mark SHIPPED** without issue #390 closure criteria and explicit owner approval.

## Kernel scope completed in Wave 1

New files:
- `packages/domain/src/prompt-promotion.js`: immutable revision creation, canonical digest, tamper detection, independent evidence + approval gate. This does **not** perform activation.
- `services/control-api/test/prompt-promotion.test.js`: eight deterministic test cases wired into the existing `npm test` glob.

Local command: `node --test services/control-api/test/prompt-promotion.test.js` → **8/8 passed** at preparation time. This is **developer-local test evidence only**; no exact GitHub-head CI or independent review yet.

This predicate is **not** a complete authorization boundary: receipts and approvals are plain input objects, identities are not yet cryptographically authenticated, and no persisted atomic compare-and-swap or rollout exists. Treat `ELIGIBLE_FOR_STAGED_ACTIVATION` as an advisory result only until Wave 2 binds authoritative storage, authenticated policy, and independently generated evaluator receipts.

## Known blockers / release truth

1. Live REA provider not available in this session (manual public-evidence mode, `REA_PROVIDER_UNAVAILABLE`).
2. Nested LinkedIn redirects failed; exact articles for every resource are not independently resolved.
3. Existing issue #390 remains NO-GO (security, live provider measurements, tenancy, runtime, production approval).
4. This branch begins from `main` while #401 remains an unmerged release candidate; integration and conflict resolution require reviewed sequencing.
5. Additional build WIP and relevant ownership approvals must be checked before broader Wave 2 work.

## Next verifiable action

Open a **draft** PR containing this dossier and pure kernel. Run exact-head repository CI and request independent security/domain review. Integrate only after open-stack reconciliation; never auto-merge or deploy.
