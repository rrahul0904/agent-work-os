# RE-297 Phase A: independent local decision memory

Implements a limited, opt-in, repo/worktree-local capability inspired only by the public research specification in [the RE-297 dossier](reverse-engineering/continuity-decision-memory-re297.md). No commercial Continuity source, VSIX, CLI/MCP implementation, or benchmark fixture was used or copied. The public benchmark repository is **not** commercial product source. This module makes no parity, hosted, security-certification, performance, automatic-capture, MCP, editor, or production claim.

## Boundary and storage

Requires Node 22; no new npm dependencies. `npm run memory -- init --root /absolute/worktree --repository owner/project` creates `.agent-work-os/memory/scope.json`, `journal.jsonl`, and the recoverable `current.json` projection under that real worktree. `.agent-work-os/` is gitignored by default: private decisions are **not** automatically team-shared. Review and sanitise data before any manual copy or Git sharing. The journal is the sole authority; projection is a disposable cache. Scope stores a random project ID, human-readable repository reference, and canonical absolute worktree. Copying the directory into another worktree fails closed; separate worktrees do not share memory. All writes are explicit, local, under an exclusive mkdir lock, hashed and fsynced before atomic projection refresh. Recovery on restart replays the chain and reports corruption rather than silently ignoring it. Dead-PID lock recovery is for cooperating processes on the same local machine, not NFS or hostile multi-user directories. SHA-256 protects against accidental divergence but is **not** a cryptographic signature against a malicious filesystem writer. Unsupported schema versions fail closed; migration between schema versions is not implemented.

Version 1 decisions carry `id`, `revision`, `scope`, `claim`, `choice`, `rationale`, `provenance` (`source`, caller-supplied `sourceHash`, `actor`, `recordedAt`), `affectedPaths`, `tags`, `verification` (`tentative` or `verified`), `sensitivity` (`private` or `shareable`), `supersedesId`, `status`, and `contentHash`. The supplied source hash is a citation field, **not** proof that a source document was independently verified. Edits require an expected revision and create an audit revision; supersession explicitly changes the projection; retraction appends a tombstone and removes the decision from current recall. Neither retraction nor `doctor --repair` securely erases historical bodies, backups, logs, or exported copies. There is no physical deletion/erasure workflow in Phase A.

## Local CLI

```
npm run memory -- init --root /abs/worktree --repository owner/project
npm run memory -- log --root /abs/worktree --claim 'why' --choice 'selected approach' --rationale 'observable evidence' --source 'issue://123' --source-hash 'source-digest' --actor 'operator' --verification verified --paths src/main.js
npm run memory -- list --root /abs/worktree
npm run memory -- search --root /abs/worktree approach
npm run memory -- inspect --root /abs/worktree <decision-id>
npm run memory -- edit --root /abs/worktree <decision-id> --expect 1 --choice 'new reviewed choice'
npm run memory -- retract --root /abs/worktree <decision-id> --expect 2 --reason 'withdrawn'
npm run memory -- export --root /abs/worktree --format json
npm run memory -- export --root /abs/worktree --format markdown
npm run memory -- doctor --root /abs/worktree
npm run memory -- doctor --root /abs/worktree --repair
```

Exports are explicitly **private/local**, contain retained historical content, and are not safe team-share or secret-scrubbed artifacts. `doctor` checks the authoritative hash chain and projection; `--repair` can rebuild a missing/stale projection or **truncate only an incomplete final line**. Mid-file JSON/hash/sequence corruption fails closed even with repair. Back up and inspect before truncating a partially written tail. There is no automatic hook, prompt interception, secret detection, governance approval, conflict merge UI, or audited team synchronisation.

## Snapshot and first-value proof

A session handoff is explicit and stores a bounded goal, actions, changed relative paths, tasks, risks, next action, checks, caller-supplied old session/thread/machine identifiers and **up to eight currently verified** decision references (ID, revision, content/source hash). Tentative notes are never promoted into verified decisions. The source-session ID is a caller-supplied link; Phase A does not independently attest that the control plane ran that session.

```
npm run memory -- handoff --root /abs/worktree --session <old-session-id> --machine <machine-id> --thread <native-thread-id> --goal 'next objective' --checks 'echo passed'
npm run memory -- recall --root /abs/worktree <handoff-id> --session <different-new-session-id> --machine <machine-id>
```

A normal control-plane `POST /api/sessions` may optionally include `handoffId` alongside the ordinary `machineId`, `cwd`, `agent`, and `prompt`. On `session.start`, the **local daemon** validates the snapshot against the canonical worktree and machine, writes an idempotent new-session recall proof, and emits a `memory.proof` event **before** launching the adapter. The event sent to the control plane contains the project/snapshot/decision IDs and hashes, not decision bodies. The full provenance and text can be inspected locally using `recall`/`inspect`; the raw prompt is not modified or sent as executable instructions. A bad handoff fails the start command rather than falling back to an unproven handoff. The control plane now records negative command acknowledgement as a failed session. The deterministic echo acceptance test exercises this lifecycle across a real daemon stop/restart; an unknown handoff is rejected without launching the echo adapter. A Codex/editor/MCP runtime, cross-host recall, prompt re-injection, source-aware targeted retrieval, and product parity are **not** certified by that test.

At recall time a superseded, retracted, tentative, or amended record with a different revision/hash is omitted from the recalled references; the original snapshot still remains available for audit. A new explicit handoff captures the new current decision set. There is no background recall or unseen automatic capture.

## Verification

`npm test` runs deterministic memory tests (new-session restart/idempotency, edit/supersession/retraction, separate processes and concurrent writes, dead lock owner, torn tail, forged chain, stale projection, project/worktree isolation, validation and CLI doctor repair). `npm run acceptance` exercises control-plane -> daemon -> echo -> new real session with visible pre-agent proof. These are local simulation tests and do not establish upstream benchmark results, production durability on network filesystems, cross-client parity or security hardening. Phase B operation-targeted retrieval and Phase C governance/operator workflows stay separate.
