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

Capability Fabric can now turn a compilation result into an install plan and apply it to an explicitly selected harness root. Runtime writes require explicit approval. The installer:

- normalizes and bounds every generated path beneath the target root,
- refuses symbolic-link traversal,
- refuses non-regular overwrite targets,
- backs up files before replacement,
- writes atomically,
- records installed and previous digests, and
- persists an install receipt under `.agent-work-os/capability-backups/<install-id>/`.

Rollback is drift-safe by default: if a generated file changed after installation, rollback stops instead of overwriting the user's new content. A caller must deliberately opt into a forced rollback.

The CLI exposes these flows through `npm run capability -- install ... --approve-write`, `rollback`, `registry-add`, `registry-list`, and `registry-resolve`.

## Verification boundary

The current implementation verifies schema behavior, deterministic compilation, durable local registry behavior, guarded install/rollback, symlink refusal, and drift-safe rollback. Real-harness execution remains a separate gate: generated artifacts should be executed against harness-specific smoke tasks and promoted only after a runtime execution receipt passes policy.

## Clean-room rule

Capability Fabric may learn from public product behavior, open standards, public documentation, and appropriately licensed source material. It must retain provenance and license data and must not copy third-party branding, private APIs, protected assets, or external marketplace content without an explicit compatible license and a deliberate import decision.
