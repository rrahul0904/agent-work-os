# REA intake: Pathrule path-scoped context — first implementation wave

**Governance issue:** https://github.com/rrahul0904/agent-work-os/issues/363
**Reddit:** https://www.reddit.com/r/coolgithubprojects/comments/1xb4sx2/
**Upstream:** https://github.com/pathrule/pathrule pinned to 826a2c9451a9aac2ad13de00033753b8f5473b08
**License:** Apache-2.0 open core. Pathrule trademarks and brand excluded. This implementation imports no upstream code/assets or third-party dependencies.

## Decision

DONOR_REFERENCE -> bounded module in Agent Work OS, not a new product/repo. ADR-001 retains policy, approval, work-item, verification and Shipping OS authority. This is different from the existing Context Continuity Workbench, which converts full agent sessions and creates evidence briefs. Both may feed the canonical context plane later.

## Inspected source capabilities

Upstream advertises path-specific rules/memories/skills, deterministic just-in-time retrieval, hook/MCP surfaces, SQLite, optional cloud, and benchmarked token savings. Upstream benchmark numbers are **claims**, not independently reproduced results.

## What this first wave implements

- Separate zero-dependency Node 22 package at packages/path-context.
- Local JSONL store per canonical absolute workspace path, private file mode 0600, no account, network or sync.
- Reviewed, sourced, immutable records. Accepted kinds: rule, memory, skill.
- Workspace-relative scopes with descendant inheritance, exclusion of sibling scopes, traversal/drive rejection, symlink store rejection.
- Mandatory rule priority and fail-closed briefing budget; optional relevance-ranked memory and skill content; deterministic receipt digest.
- Opt-in pre-session and follow-up context in existing daemon adapters, including Codex and Claude Code. Defaults off, so baseline sessions are unchanged.
- Explicit local management command to add, list, preview context, plus six local tests.

This is NOT per-tool just-in-time context: the initial daemon bridge injects at the workspace root on each session turn. No new approval framework or tracker has been created.

## How to run

Node 22+, repository root. First create a locally reviewed record in /tmp/approved-context.json:

~~~json
{
  "id": "release-gate",
  "kind": "rule",
  "scope": "/",
  "body": "No release without the Agent Work OS Shipping OS approval gate.",
  "source": "local:adr-001",
  "approved": true,
  "reviewedBy": "repository-owner",
  "priority": 100
}
~~~

Then execute:

~~~bash
node scripts/context-memory.mjs add "$PWD" /tmp/approved-context.json
node scripts/context-memory.mjs list "$PWD"
node scripts/context-memory.mjs preview "$PWD" / "release"
AGENT_WORK_OS_CONTEXT_ENABLED=true npm run start:daemon
npm run test:context
~~~

The default store location is ~/.agent-work-os/context/<sha256(realpath)>.jsonl. Use AGENT_WORK_OS_CONTEXT_HOME to override its root (e.g. in tests). Any content you add is delivered to models as **lower-trust reference**; it cannot authorize actions or override policy. Do not store secrets. The "reviewedBy" field is only an attribution claim and does not yet establish authenticated reviewer identity.

## Explicit gaps / next gates

1. Independent review of threat model and concurrent-writer race; file-level locking, append receipts, versioned supersession and reliable archival.
2. Real per-file pre-tool path hooks where supported, with fallback MCP context lookup and policy-separated execution.
3. Native capability-registry projection, canonical work/receipt trace and visible graph in operator console.
4. Replay comparison vs baseline: same tasks, identical model, exact refs, outcome correctness, tokens, missed rules, time and regressions.
5. GitHub CI and runtime acceptance at exact branch SHA, independent QA. Do not merge or deploy without the Shipping OS gate.

**Status:** First implementation wave; NOT a shipped product or verified performance gain.
