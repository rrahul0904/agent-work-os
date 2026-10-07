# RE-359 — TauCode capability-donor research and clean-room build plan

Research date: 2026-10-01

## Scope

This dossier treats Tau/TauCode as a public capability donor for Agent Work OS. It does not copy Tau branding, UI, source structure, prompts, or implementation text. The first implementation slice is independently authored against observable product behavior and public documentation.

Primary sources:
- Reddit intake: https://www.reddit.com/r/coolgithubprojects/comments/1wuv0s7/
- Tau repository: https://github.com/AbdoKnbGit/tau
- Tau public head examined: 98c0255f3fad7d7197fe22ac6bded53771eab35c (2026-10-01)
- Tau README / provider / command documentation at that exact public head

Comparator / feedback sources:
- Earlier Tau public discussion in r/aiagents, r/freetoolsAI, and r/Qwen_AI
- Empryo public product/repository, raised by a commenter as a comparison point: https://empryo.com and https://github.com/proxysoul/Empryo

## Evidence classification

### Publicly corroborated capability surface

The public Tau repository and documentation expose implementation areas for provider-specific lanes, persistent Python evaluation, snapshots, search/tooling, LSP, browser/remote control, subagents, session handling, and a VS Code integration. These establish that the public project contains corresponding implementation surfaces; they do not establish performance, security, quality, or cost superiority.

### Claims that require independent measurement

Do not inherit or repeat as facts without our own evidence:
- token or money savings versus another agent;
- cache-hit improvement in real provider traffic;
- better coding quality;
- security of remote/browser operation;
- provider parity across 28 providers;
- production readiness.

## Feedback translated into requirements

1. **Differentiation must be provable.** Avoid an OpenCode/Pi clone claim. Surface concrete mechanics and receipts.
2. **Cost claims must be measured.** Record input, cached input, output, turns, and tool calls. Never infer dollars without configured prices and comparable runs.
3. **Execution must be steerable.** Economy/standard policies, explicit mutation approval, dry-run plans, and action receipts.
4. **Recovery must be first-class.** Deterministic checkpoint/restore will be a dedicated phase, not an implied feature.
5. **Provider switching must fail closed.** Check context capacity and required capabilities before switching; later add cross-provider continuity tests.
6. **Onboarding must be understandable.** Future UX should explain whether Agent Work OS is a harness, which runtime/provider is active, and what permissions are in force.
7. **Independent verification.** A builder may not self-certify a successful task. Reviewer evidence is separate from builder evidence.
8. **Graph-aware editing is a comparator, not copied behavior.** Empryo suggests dependency/symbol-aware context and independent reviewer loops; evaluate these in later phases with original contracts.

## Canonical product mapping

Tau overlaps an existing owned workstream: Agent Work OS already owns the local daemon, coding-agent adapters, session continuity, normalized events, approvals, worktree/review roadmap, and remote operator control. Therefore RE-359 is a capability-donor track inside `rrahul0904/agent-work-os`, not a new standalone repository.

Autonomous Forge remains the portfolio-level planner/orchestrator and may consume Agent Work OS capabilities later; it is not the canonical implementation location for this harness slice.

## Phased rebuild

### Phase A — cost-aware harness policy core (this slice)

- versioned provider-lane contract;
- bounded economy/standard execution policies;
- mutation capability approval gate;
- deterministic static-prefix fingerprint receipts;
- measured token/cache/turn/tool-call receipt;
- provider-switch context/capability preflight;
- independent verifier receipt that rejects self-certification;
- focused deterministic tests.

Exit evidence: local focused tests plus exact-head repository CI. No live provider/cache claim.

### Phase B — bounded repository intelligence

- repository search/read contracts with ignore/generated-directory policy;
- bounded line/window reads and explicit truncation receipts;
- symbol/dependency hints using original implementation;
- source-anchor receipts and deterministic search fixtures;
- no broad source dump into prompts by default.

### Phase C — checkpoints, permissions, and dry-run execution

- isolated snapshot/checkpoint store separate from the repository history;
- restore/diff/list contracts;
- dry-run execution plans and immutable action receipts;
- per-capability approvals and deny-by-default mutation policy;
- restore/idempotency/restart tests.

### Phase D — persistent compute worker

- persistent Python worker with explicit workspace, CPU/time/output/network budgets;
- structured cell/result receipts and artifact references;
- restart and poisoned-kernel recovery;
- no unrestricted host execution claim.

### Phase E — durable subagents and independent review

- named durable workers with explicit task scope and provider lane;
- overlapping-file edit leases/serialization;
- independent verifier role and rejection/rework loop;
- dependency-aware work ordering;
- restart/resume and bounded-hop tests.

### Phase F — optional integrations

- LSP diagnostics on demand;
- browser adapter with explicit read/mutate permissions;
- MCP adapter registry;
- secure remote operator channel and mobile approvals;
- GitHub read/write operations with separate authorization gates.

### Phase G — provider matrix and measurable optimization

- additional native/provider adapters only as needed;
- cross-provider context portability test matrix;
- fallback routing with explicit degradation receipts;
- controlled benchmark harness for turn count, token use, cache share, correctness, and verifier rejection rate;
- cost comparison only when pricing is configured and comparable runs are captured.

## Phase A boundaries

- no copy of Tau source or UI;
- no claim of upstream parity;
- no live provider request;
- no actual cache-hit claim from prefix fingerprints alone;
- no unrestricted shell/network execution;
- no automatic push, merge, deploy, or production-readiness claim;
- no autonomous repository mutation from policy configuration alone.


## Owned implementation status — 2026-10-01

The RE-359 draft now contains independently authored slices for every planned phase, with different truth levels:

- **A — harness policy core:** provider lanes, bounded modes, exact mutation approval, prefix/usage receipts, provider-switch preflight, independent verification.
- **B1 — repository intelligence:** bounded root-safe reads/search, generated-directory pruning, secret-like filename refusal, symlink refusal, source anchors and hard scan budgets.
- **C — execution safety:** deterministic dry-run plans, external checkpoint manifests, exact-plan authorization, restore preview, missing-target refusal, tamper detection and idempotent restore behavior.
- **D — persistent compute core:** persistent Python process with exact-code authorization, single-use approvals, source/output/time/cell budgets and restart-after-timeout. This backend is deliberately classified **weak-host-process**: filesystem, network and memory isolation are not enforced.
- **E — durable coordination core:** durable builder/verifier task state, scoped edit leases with TTL/renewal, overlap refusal, bounded rework, restart reconciliation and separate verification receipts.
- **F — integration contract core:** lifecycle and permission contracts for LSP/browser/MCP/remote/GitHub adapters, network disabled by default, explicit network allowlisting, browser-origin allowlists, exact-payload mutation approvals and redacted receipts. These are contracts/fake-adapter tests, not live provider certifications.
- **G — benchmark evidence core:** comparable-workload/context digests, independent verification outcome, token/cache/turn/tool/duration metrics, provenance-bearing pricing schedules and descriptive deltas without a winner score. No real provider benchmark has been claimed.

### First wired end-to-end path

The first runtime-composed RE-359 capability is intentionally read-only:

```text
Authenticated local API
  -> existing control-plane WebSocket machine channel
  -> local daemon
  -> configured harness-root allowlist
  -> bounded repository status / search / windowed read
  -> structured command result
```

The harness API requires the configured Agent Work OS token, and the daemon separately refuses any requested root outside `AGENT_WORK_OS_HARNESS_ROOTS`. Repository intelligence still enforces path traversal, symlink, generated-directory, secret-like filename and budget rules inside that authorized root.

No RE-359 HTTP endpoint exposes repository mutation, checkpoint restore, Python execution, browser mutation, GitHub writes or deployment. Those capabilities remain library/runtime contracts requiring separate product wiring and authorization gates.

### Remaining work before any production-readiness discussion

- integrate harness policy/usage receipts into real provider adapter turns rather than only contract tests;
- add separately authorized live LSP/browser/MCP/GitHub adapters only where required;
- replace the weak Python backend with an enforcing sandbox backend before claiming filesystem/network/memory isolation;
- run controlled same-workload provider benchmarks before making cost/cache/quality comparisons;
- complete UI/operator flows, broader cross-platform/device tests, security/privacy review, release packaging and deployment evidence;
- review and merge only after the draft PR is independently reviewed.
