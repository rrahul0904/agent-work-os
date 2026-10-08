# Dotbrain donor analysis — Project Context Spine

Status: **implementation in progress**  
Tracking issue: #79  
Implementation PR: #80

## 1. Source identification

Primary public source:

- Reddit launch post: `r/coolgithubprojects` — “I built Dotbrain to keep project knowledge and workflows connected across Claude Code and Codex”
- Official repository: `arminzou/dotbrain`
- Official documentation: `https://arminzou.github.io/dotbrain/`

Evidence classification used by this analysis:

- official-source — donor GitHub repository and its README/source tree;
- official-doc — donor documentation site;
- first-party-public — author’s Reddit launch post;
- community-public — Reddit discussions about persistent coding-agent context/memory;
- internal-evidence — Agent Work OS contracts, receipts, tests, and existing runtime architecture.

## 2. Reconstructed user problem

The donor is aimed at projects where a short `AGENTS.md`/`CLAUDE.md` is no longer enough. The recurring problem is not merely retrieval of old notes. It is maintaining a current, inspectable project model across sessions, tools, worktrees, and implementation/review cycles.

The reconstructed jobs-to-be-done are:

1. teach a newly started coding-agent session the project vocabulary, constraints, decisions, and current design;
2. keep that project knowledge outside the application source repository when it is private or operator-specific;
3. make context inspectable and versionable as ordinary files rather than opaque model memory;
4. separate durable knowledge from task/execution state;
5. feed implementation discoveries back into design and durable project context;
6. allow multiple coding-agent runtimes to consume the same project context.

## 3. Donor workflow reconstruction

The donor’s documented loop is approximately:

`unknowns -> decisions -> design -> issues -> execution -> review -> close -> durable context`

Important behavior patterns:

- a project-specific private “Brainspace” stores context, ADRs, designs, and project conventions;
- execution state is separate and represented through a dependency-aware tracker;
- worktrees are expected to share the same durable project context;
- session-start behavior supplies context to a fresh coding-agent session;
- skills/subagents package planning, execution, review, curation, and teaching capabilities;
- active design is a living authority while durable conclusions are promoted back into project context at closeout.

## 4. Failure modes and risks

A literal clone of the donor architecture would be a poor fit for Agent Work OS. The important risks are:

- **stale context** — old architectural guidance can be worse than no guidance;
- **silent context loss** — an agent may run without the context the operator assumed was present;
- **unbounded prompt growth** — storing everything eventually turns context into noise and cost;
- **private-context leakage** — copying project memory through a hosted control plane creates an unnecessary privacy boundary;
- **filesystem coupling** — symlink-based wiring is operationally fragile across platforms and worktree layouts;
- **tracker coupling** — forcing one external tracker into Agent Work OS would duplicate existing work-graph/run state;
- **authority confusion** — project context must not implicitly authorize push, merge, deploy, or provider writes;
- **self-approval** — an implementation agent must not silently rewrite human-owned success criteria to make a task “pass”;
- **opaque memory** — raw chat history or model-managed memory is difficult to review, supersede, retract, or replay exactly.

## 5. Competitive pattern scan

Public projects around coding-agent memory broadly fall into four patterns:

1. small Markdown/`AGENTS.md` stores kept with the code;
2. append-only facts/logs with compact curated summaries;
3. MCP/local databases keyed by project;
4. workflow-oriented context folders that carry plans, handoffs, and decisions between agents.

The useful consensus is not “store more.” The stronger pattern is **bounded current truth + durable provenance + explicit handoff**. Agent Work OS therefore treats context selection and injection as a receipt-bearing runtime operation rather than as a generic notebook feature.

## 6. Internal donor audit

Agent Work OS already owns the stronger execution/control-plane concerns:

- local daemon + hosted control plane;
- multi-agent adapter boundary;
- durable session/run state;
- isolated worktree and shipping flows;
- acceptance/evidence receipts;
- explicit approval and deployment gates.

Therefore this work must converge into the canonical Agent Work OS runtime rather than creating a standalone Dotbrain clone.

## 7. Product thesis

**Project Context Spine** gives a dispatched worker/reviewer/verifier the exact current project intent and reasoning needed for its task while keeping private project knowledge local to the developer-owned machine.

The hosted control plane may carry context *references and receipts*, but not the private context body by default.

## 8. Clean-room target architecture

```text
Hosted control plane
  session request
  { projectId, worktreeId?, taskId?, runId?, budgetChars? }
        |
        v
Local daemon
  ProjectContextStore (~/.agent-work-os/project-context by default)
        |
        +--> immutable project-context revision + SHA-256 digest
        +--> deterministic bounded context-handoff/v1
        +--> local persisted handoff for restart/replay
        |
        v
  coding-agent adapter
  [bounded project context] + [user task]
        |
        +--> content-free context-injection-receipt/v1
             returned to the control plane/session event stream
```

No symlink is required. No private context body needs to cross the hosted boundary.

## 9. Canonical contracts

### `project-context/v1`

Current bounded snapshot of project vocabulary, constraints, active decisions, active design, and evidence references.

### `project-context-revision/v1`

Immutable envelope over a normalized snapshot, addressed by SHA-256 digest.

### `context-handoff/v1`

A deterministic bounded rendering tied to `projectId`, optional worktree/task, and a run/session identifier. It stores both context and prompt digests and is persisted locally.

### `context-injection-receipt/v1`

Proof that a particular context revision and rendered prompt were injected into a particular run. The receipt contains hashes and bindings, not the private project text.

### Future contracts

- `decision-record/v1` — independent provenance/supersession/retraction record;
- `design-record/v1` — active/closed/superseded design lifecycle with human-owned success criteria;
- `context-curation-report/v1` — staleness, contradiction, budget, and scope findings.

## 10. Required invariants

- private context is stored outside the target source repository by default;
- path traversal and cross-project reads are refused;
- identical snapshots produce identical content digests;
- immutable revision files are integrity checked on read;
- superseded/retracted decisions are excluded from a current handoff;
- handoff rendering is deterministic and bounded;
- requested-but-missing context fails closed;
- every context-bearing session can expose an injection receipt;
- receipts do not contain the private context body;
- context does not grant push/merge/deploy/provider-write authority;
- context absence must not be required for the application repository itself to build/run;
- task/run state remains separate from durable project knowledge.

## 11. Verification matrix

| Gate | Evidence target | Status |
| --- | --- | --- |
| deterministic revision digest | unit test | implemented |
| restart/replay revision read | unit test | implemented |
| exact project/worktree/task/run binding | unit test | implemented |
| bounded deterministic handoff | unit test | implemented |
| superseded/retracted filtering | unit test | implemented |
| path traversal / project isolation | negative test | implemented |
| tamper detection | negative test | implemented |
| content-free injection receipt | unit test | implemented |
| requested context fails closed | negative test | implemented |
| API reference-only request | control-plane validation | implemented; integration verification pending |
| daemon session-start injection | daemon wiring | implemented; integration verification pending |
| control-plane receipt persistence | session event path | implemented by existing event storage; end-to-end proof pending |
| browser/Shipping Console visibility | hosted browser test | pending |
| restart with persisted local handoff | recovery test | pending |
| independent reviewer verification | review receipt | pending |

## 12. Explicit non-goals

This phase does not:

- copy Dotbrain source or branding;
- make Beads a required Agent Work OS dependency;
- mirror private context into target repositories;
- store raw conversation transcripts as project memory;
- accept arbitrary context payloads through the hosted API;
- allow an agent to change success criteria without an explicit approved design change;
- merge or deploy merely because tests pass.

## 13. Next build gates

1. add control-plane integration tests proving only context references are accepted and forwarded;
2. add daemon/control-plane end-to-end test with the echo adapter and a temporary private context root;
3. expose context revision/digest/receipt status in the Shipping Console without exposing private context text;
4. add curation report contract and staleness/supersession rules;
5. exercise restart/replay and multi-worktree isolation;
6. obtain independent review and only then move PR #80 out of draft.
