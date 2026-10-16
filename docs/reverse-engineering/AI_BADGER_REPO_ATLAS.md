# REA Dossier: AI Badger → Repo Atlas / Context Evidence

**Intake:** Reddit `r/SideProject` short link `8nHwJ9y3Au`  
**Captured:** 2026-10-16  
**Donor/reference:** `PVRLabs/aibadger` (MIT, Go)  
**Pinned donor snapshot:** `3c00c4c050aa68cace6a4299b281561a073ebb8e`  
**Canonical implementation home:** `rrahul0904/agent-work-os`  
**Routing decision:** donor/reference absorbed into Agent Work OS; no standalone clone/repository.  
**Implementation branch:** `rea/ai-badger-repo-atlas`

## Observed donor behaviors

Public source and documentation support these behaviors:

- local/offline codebase mapping from a directory;
- language classification and nonblank source-line accounting;
- bounded scanning with explicit depth/directory/file/file-size/report-size limits;
- fixed dependency/build/cache directory exclusions;
- symlink-root refusal and no symlink traversal;
- metadata-only visualization output rather than source-code embedding;
- standalone HTML generation with no provider/server requirement;
- AI handoff/context-selection workflows in the wider product.

## Product decision

Do **not** build an AI Badger clone.

Owned flow:

`Agent Work OS → Repository Intelligence → Repo Atlas → Repository Context Evidence → ContextPack/evidence ledger → delegated agent`

Repo Atlas is an internal capability name, not a new standalone product boundary.

## Clean-room differentiation

### MATCH

- offline/local scan;
- deterministic directory/file/language accounting;
- explicit scan limits;
- default dependency/build/cache exclusions;
- symlink refusal/no traversal;
- no source contents in map artifacts.

### IMPROVE

- `.gitignore` / `.repoatlasignore` subset support;
- machine-readable `RepoMapSpec`;
- deterministic content digest;
- token-cost estimation;
- task-aware context ranking;
- repository context emitted as an evidence artifact that can be referenced by the existing Agent Work OS `ContextPack`.

### NEXT / NEW

- package/module/service boundary detection;
- import/dependency graph;
- Git churn and ownership overlays;
- complexity and test/coverage overlays;
- branch/commit map diff;
- incremental/watch mode;
- Repo Atlas UI/treemap;
- MCP/CLI adapters.

## M1 implemented on this branch

1. `packages/repo-intelligence/src/index.js`
   - deterministic repository scanner;
   - metadata-only file inventory;
   - language/directory accounting;
   - safety exclusions and bounded limits;
   - root/nested ignore rules;
   - symlink refusal/no traversal;
   - binary filtering;
   - deterministic SHA-256 map digest;
   - task-aware file ranking;
   - estimated token-budget selection;
   - `repo-context-evidence/v1` output.

2. Contracts
   - `contracts/repo-map-v1.schema.json`
   - `contracts/repo-context-evidence-v1.schema.json`

3. Tests
   - deterministic map generation;
   - source-content non-retention;
   - default exclusions and ignore rules;
   - task relevance and token budget;
   - symlink-root refusal / entry skipping;
   - fail-closed source-size limit.

## ContextPack integration rule

PR #195 already owns the provider-neutral delegation `ContextPack`. Repo Atlas therefore does not create a competing type.

```text
repository snapshot
  → RepoMapSpec
  → task relevance + token budget
  → repo-context-evidence/v1
  → Evidence Ledger ID
  → ContextPack.evidenceIds[]
  → bounded child agent
```

## Security/privacy invariants

- source contents are never stored in `RepoMapSpec`;
- symlink roots are rejected;
- symlink entries are not traversed;
- known dependency/build/cache directories are excluded by default;
- scans fail closed when configured bounds are exceeded;
- recognized binary-like files containing NUL bytes are excluded;
- context selection contains paths/metadata, never file bodies;
- context evidence is bound to the exact repository-map digest.

Later slices must add secret scanning/redaction before source-content ContextPack materialization is allowed.

## Known M1 limits

- ignore parsing is a useful subset, not byte-for-byte Git ignore semantics;
- token count is estimated from file bytes, not a provider tokenizer;
- task relevance is deterministic lexical ranking, not embeddings/LLM scoring;
- no dependency/import/service graph yet;
- no Repo Atlas UI yet;
- no deployment/shipping claim is made.

## Verification gates

Before VERIFIED status:

- repository-wide `npm test` must pass on exact branch SHA;
- repository acceptance suite must pass on the same SHA;
- large/wide/deep/monorepo fixtures must be added;
- traversal/ignore adversarial fixtures must be added;
- ContextPack/evidence-ledger integration must be tested after the delegation contract is canonical;
- UI must consume only the versioned RepoMapSpec contract;
- Shipping OS receipt must bind tests, artifacts and exact SHA.

## M2 next slice

- detect package/module/service boundaries from workspace/build manifests;
- emit typed topology nodes/relationships;
- add JS/TS import/dependency extraction first;
- compute dependency centrality and task-relevance overlays;
- expose a read-only Repo Atlas API/CLI adapter;
- add monorepo golden fixtures and benchmark receipts.
