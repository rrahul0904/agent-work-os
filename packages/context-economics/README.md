# Context Economics — Agent Work OS experimental module

**Scope:** Independent local-first capability extension to Agent Work OS; built from our owned REA dossier and synthetic fixtures, NOT from vendor package/source/algorithms. References: issue #301; bounded Verified Context Pack #115 and canonical Memory Plane #166.

## Implemented

- Read-only deterministic context compiler with project scope, mandatory user-approved rules, verified-current decisions, explicit omission trace, source hashes and strict UTF-8 byte budget (not a provider token estimate). It cannot mutate canonical truth.
- Cache-aware session pricing for uncached input / cache creation / cache read / output. Missing usage, rate or observed-rate provenance = UNKNOWN. Synthetic fixtures are never vendor pricing claims.
- Preliminary session experiment gate blocks missing observed costs or poor task quality; further independent review/statistics is required before SHIPPED.
- Explicit allowlisted Markdown propose → approve digest → apply → undo with SHA-256, private backup/journal, stale-write refusal, symlink/hardlink checks, atomic same-directory replacement, exact byte undo and file-mode recovery.
- Node 22 tests include REA intake fixtures; no additional dependencies.

## Commands

    node --test packages/context-economics/test/*.test.js
    node packages/context-economics/src/cli.js analyze /path/to/owned-fixture.json repo-id 16384
    node packages/context-economics/src/cli.js price /path/to/measured-usage-and-prices.json
    node packages/context-economics/src/cli.js plan-edit /absolute/owned/workspace memory/AGENTS.md /tmp/edited.md /tmp/proposal.json

After independent inspection of complete proposal and diff, and only with user's explicit approval:

    node packages/context-economics/src/cli.js apply-edit /tmp/proposal.json --approve-digest=<exact-proposal-digest>

Revert intentionally:

    node packages/context-economics/src/cli.js undo /absolute/owned/workspace <transaction-id> --approve-undo

The proposal JSON contains the local file replacement encoded as base64 and is created mode 0600. Keep it and the private .agent-work-os/context-backups/<txid> journal local. The context compiler does not generate edits or silently rewrite Markdown. An unauthorized path, changed source, missing approval or unexpected post-edit drift fails closed.

## Boundaries and status

**EXPERIMENTAL / NOT SHIPPED.** Synthetic tests do not establish provider compatibility, a 20–30% cost reduction, real-world task-quality non-inferiority, or live deployment. The transaction API is a single-file controlled reference implementation, not an adversarially race-proof openat-based filesystem utility or a multi-file crash-consistent transaction engine. Provider memory formats differ: no implied Claude, Codex or Gemini hooks.

Before promotion: integrate with #115/#166 APIs and Capability Fabric instead of reimplementing stores; certified provider adapters; full-session observed cost/cache telemetry; matched-task blind quality/recall and confidence bounds; restart & hostile-concurrency hardening; independent review; exact-SHA CI receipts; human-controlled merge/release gate. Clean-room/license boundaries in REA issue #301 remain mandatory. No vendor-source inspection, package installation, cloning or runtime probing.
