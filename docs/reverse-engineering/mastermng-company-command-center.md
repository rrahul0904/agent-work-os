# MasterMNG donor → Agent Work OS Company Command Center

## Decision

MasterMNG is a capability donor, not a standalone clone target. Its public product thesis overlaps the existing Agent Work OS stack: explicit agent roles, owned work, human approvals, cross-provider continuity, and a command center. The canonical destination remains `rrahul0904/agent-work-os` so we do not create another competing task database, agent runtime, or operator shell.

## Phase A — Understand

### Publicly observed workflow

The supplied launch post describes agents with roles, shared goals/tasks, explicit ownership, and a human command center. Public discussion around the launch identifies the harder coordination problems as handoff degradation, ownership at the seams, review overhead, disagreement handling, and auditable escalation. The founder describes policy-based conflict handling where routine decisions may follow predefined authority while material architecture/security/cost/business disagreements escalate to a human and become durable task context.

The same public discussion frames the desired system above the model layer: models/providers are replaceable workers while the durable value is organizational context, workflows, permissions, approvals, history, and execution governance.

### Failure modes converted to requirements

1. Shared memory alone can become ambiguous at scale → handoffs remain explicit, bounded, evidence-bearing records.
2. Agent disagreement can silently overwrite earlier reasoning → material decisions carry policy/risk/evidence and require accountable resolution.
3. Human review can become reconstruction work → President Overview is a projection over authoritative work/run/decision facts, not chat summaries.
4. Approval endpoints can be replayed → a decision can be resolved exactly once and emits a resolution digest.
5. Audit trails that exist only in a UI are weak evidence → provide a machine-readable audit export with a deterministic digest.
6. A sophisticated org chart without repeatable workflows is decoration → execution continues to use the existing Agent Work OS daemon/session/runtime rather than inventing a second agent engine.

## Phase B — Define

### Product thesis

**Company Command Center** is the organizational/governance surface for Agent Work OS. It answers four questions without reconstructing chat logs:

- What needs the President/human now?
- Who owns each open piece of work and who manages them?
- Which agents/runs are active and what evidence exists?
- Which decisions require human authority, under which policy, and with what receipts?

### Single-source-of-truth boundary

- Project Desk: authoritative work ownership, completion evidence, decisions, human finalization.
- Existing control-plane store: authoritative machine/session state.
- Work Memory/Handoffs: bounded verified continuity across sessions/providers.
- Company Command Center: organization configuration plus read projections; it must not create parallel work/run/approval truth.

### MATCH / IMPROVE / NEW / OMIT

**MATCH**
- Company roles/reporting lines.
- President overview.
- Work ownership and review queue.
- Human Decision Desk.
- Provider-neutral agents.

**IMPROVE**
- One-shot decision resolution with proposal and resolution digests.
- `who + policy + why + evidence` on material decisions.
- Machine-readable audit export instead of UI-only history.
- Fail-closed management graph validation.
- Existing verified cross-session handoffs instead of free-form shared-memory substitution.

**NEW**
- Read-only operational metrics derived from actual Project Desk and session state.
- Explicit security floors retained in the organization contract.

**OMIT**
- MasterMNG branding/assets/source/private APIs.
- A separate agent execution engine.
- A second task database.
- Claims of autonomous low-risk conflict resolution before policy evaluation is independently certified.
- Any hosted-production claim without durable WebSocket/runtime/recovery proof.

## Phase C — Ship slice

`company-command-center/v1` includes:

- persistent organization configuration;
- President + agent member hierarchy, department, role, provider/model/runtime binding and authority labels;
- management-cycle and unknown-manager refusal;
- President Overview metrics and attention queues;
- live workforce projection over existing session state;
- evidence-rich Decision Desk;
- one-shot human resolution with exact option selection and immutable digests;
- machine-readable audit export;
- responsive `/company.html` operator surface;
- deterministic domain tests while preserving repository-wide acceptance gates.

## Phase D — Certification gates

The slice is only eligible for SHIPPED after all configured repository tests, acceptance, Docker build, browser UAT, deployment, restart/recovery, and exact-SHA evidence gates are green. A static preview alone is not the full product because Agent Work OS requires a durable control plane and developer-owned local daemon for real execution.
