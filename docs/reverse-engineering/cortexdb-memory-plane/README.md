# CortexDB reverse-engineering dossier → Agent Work OS Memory Plane

Status: research/build packet started

Target evidence date: 2026-10-13

Target identity: `liliang-cn/cortexdb` (CortexDB). The LinkedIn post describes an MIT-licensed pure-Go agent-memory/knowledge-graph system centered on one SQLite file, optional PostgreSQL + pgvector, lexical/vector/hybrid/graph retrieval, scoped memories, provenance, supersession, MCP tools, Claude Code/Codex integrations, and an optional 90-second idle capture flow. A LinkedIn comment links a different repository (`cortex-works/cortex-db`) whose description and contents do not match those claims; that link is treated as conflicting evidence, not as the canonical donor identity.

This document applies the canonical Reverse Engineering Roadmap. REA is a governed evidence/provider lane only. Agent Work OS remains the authority for policy, orchestration, clean-room boundaries, verification, replay, deployment and Shipping OS certification.

## 1. Source identification

Primary donor/reference:

- LinkedIn post by André Lindenberg: CortexDB is described as agent memory + knowledge graph in one SQLite file, Pure Go, vectors/RAG/RDF/SPARQL/Cypher, 80+ MCP tools, optional Claude Code idle capture, superseded-not-deleted history, MIT.
- Canonical implementation matching those claims: `https://github.com/liliang-cn/cortexdb`
- Public docs/package docs: `https://liliang-cn.github.io/cortexdb/` and `https://pkg.go.dev/github.com/liliang-cn/cortexdb/v2`
- License: MIT.

Conflicting/non-canonical candidate:

- `https://github.com/cortex-works/cortex-db` — a different early-alpha project focused on Cortex-Works Scrum/event state using SQLite + LanceDB. It does not match the LinkedIn feature claim set.

Identity verdict: **VERIFIED_MATCH = liliang-cn/cortexdb**; `cortex-works/cortex-db` is **REJECTED_AS_TARGET**.

## 2. Evidence ledger

Evidence labels used here: OBSERVED, INFERRED, UNKNOWN, VERIFIED.

| Capability | Evidence status | Notes |
|---|---|---|
| Local-first memory | VERIFIED | SQLite-first, single-file default |
| Optional shared/server mode | VERIFIED | gRPC server; PostgreSQL + pgvector optional |
| No mandatory embedding model | VERIFIED | lexical mode works without model/API key |
| Scoped memories | VERIFIED | user/session/global-style scopes are documented |
| Supersession | VERIFIED | newer facts can mark older memories superseded |
| Provenance/source metadata | VERIFIED | records/source grades and context packs documented |
| Vector retrieval | VERIFIED | HNSW/IVF/flat + compact quantization options documented |
| Lexical retrieval | VERIFIED | SQLite FTS5 documented |
| Hybrid retrieval | VERIFIED | lexical/vector/graph lanes fused by rank |
| Knowledge graph | VERIFIED | RDF/SPARQL/RDFS/OWL/SHACL + read-only Cypher documented |
| Graph-aware retrieval | VERIFIED | graph walk / Personalized PageRank documented |
| Retrieval authorization | VERIFIED | retrieval candidate authorization callback documented |
| Change feed | VERIFIED | committed writes appended in order in same transaction |
| MCP surface | VERIFIED | 80+ tools documented |
| Claude Code / Codex integration | VERIFIED | plugins/hooks documented |
| 90-second idle capture | VERIFIED | optional Claude Code mod behavior documented |
| Exact internal ranking formula | UNKNOWN | public behavior exists; implementation detail not required for our build |
| Full donor production reliability | UNKNOWN | feature claims and tests exist; we have not independently certified its operational envelope |

## 3. Workflow reconstruction

### Donor flow

`session/input → capture/remember → normalized memory/knowledge records → lexical/vector/graph indexes → recall plan → candidate retrieval → authorization → rank/fuse → context pack with sources → agent`

Mutation path:

`new fact → compare/current state → append/update → supersede outdated fact where appropriate → transactional change feed → later recall excludes superseded item as current`

Optional Claude Code flow:

`session becomes idle → ~90 s → model distills recent conversation → durable memory → later contradictory memory supersedes older memory`

### Agent Work OS target flow

`agent event/session/shipping receipt/REA evidence → Memory Proposal → policy/provenance gate → Memory Commit → local memory store → retrieval planner → scoped search → authorization → context pack → agent/task`

Important difference: **capture is propose→commit, never a direct autonomous final write**.

## 4. Capability + failure analysis

Capabilities worth adopting:

1. Portable local-first memory.
2. Scopes for repo/project/task/session/agent/global.
3. Supersession with historical auditability.
4. Provenance and evidence grades on every durable memory.
5. Lexical retrieval as a dependency-free baseline.
6. Optional semantic/vector retrieval behind a provider boundary.
7. Graph edges for entity/task/repo/dependency relationships.
8. Retrieval-time authorization.
9. Transactional change feed.
10. Import/export and migration paths.
11. Memory health/observability.

Failure modes to design out:

- **Idle-capture premature commit:** a 90-second silence can occur while a person is reading or thinking. Our design stages a proposal and requires either a stable lifecycle event (session completion/task checkpoint) or a policy-approved promotion condition.
- **Recall feedback loop:** frequently recalled items must not automatically become more important just because they were recalled.
- **Stale truth:** historical memories remain auditable but superseded claims must not be surfaced as current truth by default.
- **Cross-project contamination:** project/repo/worktree/task namespaces must be enforced at query time.
- **Evidence leakage across clean-room boundary:** donor/REA evidence is isolated from implementation-agent memory; only approved derived contracts cross the boundary.
- **Unbounded growth:** compaction, consolidation, archive/export and explicit purge are required.
- **Privacy trap:** “never delete” cannot be our policy. Supersession is default history behavior, but explicit purge/delete must exist for authorized user/privacy requests.
- **Model outage:** lexical retrieval remains available when an embedder is unavailable.
- **Authorization bypass:** filtering after ranking is insufficient if it can starve authorized results; authorization is part of candidate selection/over-fetch behavior.

## 5. User feedback captured from source discussion

Positive signal:

- Single-file deployability is a strong product advantage compared with sprawling multi-service memory stacks.

Negative/critical signal:

- Commenters flagged a repository identity mismatch/empty-repo concern. We resolve this through explicit target identity evidence before implementation.
- A commenter noted that a fixed 90-second idle timer can save an unfinished thought. We will not copy that behavior literally.

## 6. Competitive/dedupe result

Existing internal project `contextualmemoryreweaving` is research-oriented and explores layered persistent memory. It should remain a research donor, not become the production control plane.

Agent Work OS already owns durable sessions, local daemon execution, adapters, Shipping OS receipts and future task/worktree/PR orchestration. Therefore the correct product boundary is:

**Memory Plane = a subsystem of Agent Work OS, not a new standalone repository.**

## 7. Internal donor audit

Current Agent Work OS durable store persists control-plane state (`machines`, `sessions`, `shippingRuns`) as a JSON-shaped snapshot, optionally stored in PostgreSQL. That store should remain operational state storage.

Memory Plane must be a separate abstraction with its own contracts and persistence because durable semantic memory has different requirements: provenance, scope, history, supersession, search, graph relations, policy and deletion.

Reuse candidates from our codebase:

- existing session/message/event stream as capture source;
- existing Shipping OS receipts as high-confidence memory/evidence source;
- existing local daemon as preferred location for repo-sensitive/local memory;
- existing auth/policy layer for retrieval authorization;
- existing exact-SHA receipt model for memory feature certification.

## 8. Product thesis / boundary

### Product thesis

Agent Work OS Memory Plane gives coding and operating agents a durable, portable, policy-governed memory that can answer: **what happened, what was decided, what is true now, where did it come from, and what changed?**

### V1 boundary

V1 MUST include:

- memory create/propose/commit;
- scopes: global, project, repo, task, worktree, session, agent;
- provenance: source type/id/hash, producer, evidence grade;
- temporal fields: created, valid-from, superseded-at;
- supersession and conflict tracking;
- FTS/lexical search;
- optional vector provider interface (no mandatory embedding dependency);
- simple typed graph edges;
- retrieval authorization;
- change log;
- explicit purge/delete;
- import/export JSONL;
- deterministic tests and replay fixtures;
- context-pack output with citations/source IDs.

V1 MUST NOT include:

- full RDF/SPARQL/OWL/SHACL compatibility;
- 3D graph UI;
- an 80+ tool surface;
- automatic write-on-idle as the only capture trigger;
- recall-count ranking feedback;
- centralized upload of private repo contents by default.

Those are later candidates only if evidence shows they materially improve our product.

## 9. Contracts / acceptance tests

### Memory record contract

```json
{
  "id": "mem_*",
  "scope": {"type": "repo", "id": "owner/name"},
  "kind": "fact|decision|constraint|preference|outcome|evidence|procedure",
  "content": "...",
  "entities": ["..."],
  "relations": [{"predicate": "...", "object": "..."}],
  "source": {
    "type": "session|receipt|rea|git|user|system",
    "id": "...",
    "contentHash": "sha256:..."
  },
  "grade": "observed|asserted|inferred|verified|refused",
  "createdAt": "ISO-8601",
  "validFrom": "ISO-8601|null",
  "supersedes": ["mem_*"],
  "supersededAt": null,
  "deletedAt": null
}
```

### Core acceptance tests

1. A memory survives process restart.
2. A repo-scoped memory cannot be recalled from another repo scope.
3. Superseding a fact keeps history but excludes the old fact from current recall.
4. Explicit purge removes the target and its retrieval indexes according to policy.
5. Lexical recall works with no embedder configured.
6. Vector provider failure falls back without corrupting writes.
7. Unauthorized candidates never appear in context packs.
8. Source IDs/content hashes are preserved in every recalled item.
9. Recall count/usage telemetry does not affect rank by itself.
10. Change-log sequence is monotonic and replay reconstructs equivalent current state.
11. REA evidence namespace cannot be queried by the implementation agent unless an approved derived contract exists.
12. Shipping receipt facts can be recalled as VERIFIED evidence.

## 10. Implementation plan

### Slice A — contracts + in-memory reference implementation

- `packages/memory/src/contracts.js`
- `packages/memory/src/memory-store.js`
- deterministic supersession and scope filtering
- unit tests

### Slice B — local durable backend

Preferred first backend: SQLite located on the developer-owned machine/local daemon side. If Node runtime constraints make this inappropriate for the first merge, use a deterministic file-backed adapter behind the same contract and add SQLite in the next isolated slice. Do not mix it into the existing monolithic control-plane state JSON.

Tables/logical collections:

- `memory_items`
- `memory_relations`
- `memory_sources`
- `memory_changes`
- `memory_recall_log`
- optional `memory_vectors`

### Slice C — retrieval

- lexical search;
- scope filters;
- temporal/current-truth filters;
- authorization callback;
- optional vector provider;
- rank fusion;
- context-pack renderer.

### Slice D — capture

- session-completion proposal;
- explicit `/remember`-style action/API;
- Shipping OS receipt capture;
- REA evidence capture into isolated evidence namespace;
- proposal review/policy promotion.

### Slice E — graph

- typed entity/relation edges;
- bounded N-hop expansion;
- no full RDF stack in V1.

### Slice F — import/export

- JSONL export with hashes;
- import from existing Agent Work OS sessions/receipts;
- optional later adapters for Codex/Claude memory formats.

## 11. Independent verification / replay

Verification must include:

- deterministic fixtures;
- process-restart durability;
- cross-scope isolation/adversarial queries;
- supersession/conflict cases;
- deletion/purge cases;
- vector-provider outage;
- malformed/untrusted imported memory;
- REA clean-room boundary test;
- replay of a memory change log into a clean store;
- exact-SHA CI receipt.

The compare loop is:

`expected behavior → observed implementation → delta → repair → replay → receipt`.

Donor parity is not required for every CortexDB feature. Our target is **MATCH the useful product behavior, IMPROVE governance/capture/privacy, OMIT unnecessary complexity, and ADD Agent Work OS/Shipping OS integration**.

## 12. Hosted/browser/recovery boundary

Memory for repo-sensitive agent work should stay local by default. Remote/shared memory requires an explicit transport and authorization policy. Browser/operator UI can inspect safe summaries and evidence metadata without centralizing repository secrets or raw private source by default.

Recovery requirements:

- crash-safe writes;
- backup/export;
- replayable change log;
- migration versioning;
- corruption detection where backend permits;
- no silent downgrade of authorization or scope rules.

## 13. Shipping OS certification gate

Do not mark this capability SHIPPED until all are true:

- behavior contracts merged;
- unit/integration/acceptance tests pass;
- independent verifier records exact commit SHA;
- memory persistence/restart test passes;
- authorization and cross-scope adversarial tests pass;
- explicit purge test passes;
- REA evidence/build-memory isolation test passes;
- no secrets/private source are exported by default;
- rollout/rollback path exists;
- receipt is committed under `receipts/agent-work-os/`.

## REA role in this project

REA is used as an evidence/capability discovery provider. Its output is stored as immutable evidence records with provenance and an evidence grade. REA does **not** decide what to build and does not receive deployment authority.

Canonical flow for this target:

`Target identity → authorized evidence acquisition → REA/public-source observation → evidence ledger → capability/failure model → user feedback → internal donor audit → product boundary → behavior contracts → clean-room implementation → independent verification → replay/compare → Shipping OS deploy/certify → evidence-backed tracker update`.

## Current status

- Source identity: COMPLETE
- Public evidence/capability discovery: COMPLETE for initial pass
- User-feedback extraction: COMPLETE for surfaced discussion
- Competitive/dedupe: COMPLETE
- Internal donor audit: COMPLETE for Agent Work OS + CMR boundary
- Product thesis/V1 boundary: COMPLETE
- Acceptance-test packet: COMPLETE
- Implementation: NOT STARTED in this branch
- Independent verification: BLOCKED on implementation
- Deployment/certification: BLOCKED on implementation + receipts

Next execution slice: implement the memory contracts and reference store behind an isolated feature branch, then run Agent Work OS tests/acceptance and add memory-specific replay fixtures.
