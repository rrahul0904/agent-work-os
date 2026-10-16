# Capability Fabric

Capability Fabric is the governed portability layer for Agent Work OS. It converts independently sourced agent capabilities into harness-native artifacts while preserving provenance, compatibility constraints, and deterministic verification receipts.

## Why this exists

The Reverse Engineering Agent (REA) can discover useful public capability patterns, but Agent Work OS must remain responsible for normalization, policy, provenance, compilation, verification, installation, drift detection, and rollback. Capability Fabric is the boundary between those concerns.

The initial donor/reference for this work is `wshobson/agents`, pinned during reverse engineering to commit `044b4b21f083948e69ec878a7b07c8d0951a6ffa`. The donor is MIT licensed, but external marketplace entries can carry separate licenses. Agent Work OS therefore does not blindly vendor plugin bodies. It imports evidence into an owned neutral contract and records source URL, source commit, source license, and evidence references per capability.

## Canonical model

`CapabilitySpec` is provider-neutral. It contains:

- identity, semantic version, kind, name, slug, description, triggers, and tags
- declared inputs, outputs, and prerequisites
- instructions, references, and assets
- tool, permission, model, context-budget, and network requirements
- source URL, exact source commit, license, source path, and evidence references
- evaluation cases and a quality threshold

The canonical model intentionally does not use any single coding harness as the source-of-truth format.

## Harness profiles

The first implementation carries profiles for:

- Claude Code
- OpenAI Codex CLI
- Cursor
- OpenCode
- Google Antigravity CLI
- GitHub Copilot
- Pi

Profiles declare native component support, marketplace support, hooks/MCP/parallel-agent capabilities, tool-allowlist behavior, artifact paths, and hard limits. Codex currently enforces the relevant 8 KB skill-body portability rule by splitting oversized detail into `references/details.md`.

## Compilation

`compileCapability()` performs deterministic compilation and emits:

1. harness-native files,
2. a manifest containing file hashes and compatibility warnings, and
3. a compilation receipt containing the exact capability digest, harness-profile digest, upstream source commit/license, manifest digest, warning set, and degraded capability set.

Unsupported capability classes fail closed by default. Callers must explicitly opt into degraded compilation.

## REA ingestion

`importReaCapability()` accepts evidence collected by REA and constructs a validated `CapabilitySpec`. Source URL, source commit, and source license are mandatory. This keeps REA as a discovery/evidence provider rather than the policy or runtime authority.

## Registry and drift

`CapabilityRegistry` stores versioned capabilities and resolves the latest version by slug. `createDriftRecord()` compares source commits plus instruction, requirement, and contract digests to make upstream drift explicit.

The runtime slice also provides a durable local JSON registry for development and offline use. It preserves complete validated `CapabilitySpec` versions and can list or resolve them without relying on an external service. PostgreSQL-backed multi-tenant persistence remains the production storage target.

## Guarded installation and rollback

Capability Fabric can turn a compilation result into an install plan and apply it to an explicitly selected harness root. Runtime writes require explicit approval. The installer:

- normalizes and bounds every generated path beneath the target root,
- refuses symbolic-link traversal,
- refuses non-regular overwrite targets,
- backs up files before replacement,
- writes atomically,
- records installed and previous digests, and
- persists an install receipt under `.agent-work-os/capability-backups/<install-id>/`.

Rollback is drift-safe by default: if a generated file changed after installation, rollback stops instead of overwriting the user's new content. A caller must deliberately opt into a forced rollback.

The CLI exposes these flows through `npm run capability -- install ... --approve-write`, `rollback`, `registry-add`, `registry-list`, and `registry-resolve`.

## Runtime verification receipts

### Artifact-context verification

`artifact-context` verifies semantic preservation of the exact generated and installed artifact without depending on a harness marketplace implementation:

1. validate the `CapabilitySpec`,
2. compile it for the requested harness,
3. install the generated files through the guarded installer,
4. read the installed artifact bytes back from disk,
5. execute each declared evaluation case through the existing Agent Work OS adapter,
6. score normalized harness events against the declared expected result,
7. compare the aggregate score with `qualityThreshold`,
8. persist a runtime verification receipt, and
9. roll the capability back unless the caller explicitly retains a passing installation.

The receipt records the capability/source identity, compilation receipt digest, installation receipt digest, harness executable/version, installed artifact digests, per-case event-trace/output digests, score, threshold, pass/fail state, rollback evidence, and final receipt digest.

Codex is the first wired real adapter because Agent Work OS already executes it through `codex exec --json` and normalizes text, tool, status, usage, log, and error events. Run the gate on a machine with Codex installed and authenticated:

```bash
npm run capability -- verify capability.json codex /tmp/capability-stage /path/to/workspace --approve-write
```

A failed threshold exits non-zero and rolls back automatically. Passing verification also rolls back by default so smoke tests do not silently mutate the harness environment. Use `--retain-installation` only when promotion is intentional. `--receipt=/path/to/receipt.json` selects an explicit receipt path.

### Codex native-discovery verification

`native-discovery` adds a stricter Codex-specific proof that the harness discovered and invoked the installed skill through its own plugin lookup path. The verification bundle follows the current portable OpenAI plugin layout:

```text
<workspace>/
├── .agents/plugins/marketplace.json
├── .codex/config.toml
└── plugins/<capability-slug>/
    ├── plugin.json
    └── skills/<capability-slug>/SKILL.md
```

The smoke package is intentionally instrumented with a one-run discovery marker that is appended to the installed `SKILL.md` but never included in the user prompt. The Codex request explicitly invokes `$<capability-slug>` and asks the discovered skill to return its marker before performing the declared test input. A case passes only when both the hidden marker and the expected semantic result appear in a completed, error-free harness execution.

This separates two proofs:

- `artifact-context` proves the exact production artifact preserves the intended behavior when executed by the harness.
- `native-discovery` proves Codex can discover and invoke the skill using the real plugin/marketplace mechanism.

The native-discovery package is always rolled back because it contains temporary verification instrumentation. It also fails closed when `.agents/plugins/marketplace.json`, `.codex/config.toml`, or the target plugin directory already exist; use a clean verification worktree or scratch workspace instead of overwriting project plugin configuration.

Run it with:

```bash
npm run capability -- verify-native capability.json codex /path/to/clean-workspace --approve-write
```

The command returns non-zero when the discovery marker is missing or the quality threshold fails and persists a verification receipt unless an explicit `--receipt=` path is supplied.

## Remote verification through Agent Work OS

A daemon that can execute Codex now advertises a built-in `capability-verify` agent alongside `codex`. This intentionally reuses the existing Agent Work OS session path instead of introducing a parallel control protocol. The existing session lifecycle already provides organization membership checks, machine ownership, online/capability checks, transactional daemon delivery in PostgreSQL, durable session events, interruption, and realtime updates.

Start a verification session through the normal `POST /api/sessions` endpoint. The session `cwd` is the write boundary and the `prompt` is a JSON verification request:

```json
{
  "organizationId": "org_...",
  "machineId": "machine_...",
  "cwd": "/path/to/verification-workspace",
  "agent": "capability-verify",
  "prompt": "{\"mode\":\"artifact-context\",\"harnessId\":\"codex\",\"approveWrite\":true,\"spec\":{...}}"
}
```

For native discovery use `"mode":"native-discovery"` and a clean session workspace. Remote verification has stricter mutation rules than the local CLI:

- `approveWrite` must be explicitly true,
- artifact-context `targetRoot` must remain at or beneath the session `cwd`,
- native-discovery operates exactly at the session `cwd`,
- remote verification never retains or promotes an installation,
- verification receipts are not written to arbitrary local paths, and
- interruption propagates to any nested Codex verification execution.

The daemon emits the full receipt as a structured session event:

```json
{
  "kind": "tool",
  "name": "capability.verification.receipt",
  "phase": "completed",
  "payload": { "verificationMode": "artifact-context", "passed": true, "receiptDigest": "sha256:..." }
}
```

Because this travels through `daemon.session.event`, the current control plane persists the receipt inside the session event stream and broadcasts it through the existing realtime channel. A short text summary is emitted as well so the verification result is visible in the existing session UI without teaching the UI a new resource type first.

This session-backed orchestration is the compatibility bridge. A later production slice can normalize capability verification runs into their own first-class PostgreSQL resource and API without changing the daemon verifier or receipt contract.

## Clean-room rule

Capability Fabric may learn from public product behavior, open standards, public documentation, and appropriately licensed source material. It must retain provenance and license data and must not copy third-party branding, private APIs, protected assets, or external marketplace content without an explicit compatible license and a deliberate import decision.
