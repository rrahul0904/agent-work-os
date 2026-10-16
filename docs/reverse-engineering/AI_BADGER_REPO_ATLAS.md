# REA Dossier: AI Badger → Repo Atlas / Context Evidence

**Intake:** Reddit `r/SideProject` short link `8nHwJ9y3Au`  
**Captured:** 2026-10-16  
**Donor/reference:** `PVRLabs/aibadger` (MIT, Go)  
**Pinned donor snapshot:** `3c00c4c050aa68cace6a4299b281561a073ebb8e`  
**Canonical implementation home:** `rrahul0904/agent-work-os`  
**Routing decision:** donor/reference absorbed into Agent Work OS; no standalone clone/repository.  
**Implementation branch:** `rea/ai-badger-repo-atlas`

## Product decision

Do **not** build an AI Badger clone.

Owned flow:

`Repository snapshot → Repo Atlas map/topology/risk/drift → task context + evidence bundle → Evidence Ledger ID → ContextPack → bounded agent`

Repo Atlas is an Agent Work OS repository-intelligence capability, not a separate product authority.

## Donor behaviors retained as clean-room product requirements

- local/offline repository mapping;
- language and nonblank-line accounting;
- bounded scanning and default dependency/build/cache exclusions;
- symlink-root refusal and no symlink traversal;
- metadata-only visualization rather than source-code embedding;
- standalone HTML output with no server/provider requirement;
- task-oriented repository handoff/context selection.

## Owned differentiation

### MATCH

- deterministic offline scan;
- explicit depth/directory/file/file-size bounds;
- safe exclusions and no symlink traversal;
- standalone metadata-only repository view.

### IMPROVE

- `.gitignore` / `.repoatlasignore` subset support;
- versioned machine-readable contracts;
- content-addressed SHA-256 evidence;
- task-aware context ranking with token budgets;
- module/dependency topology;
- structural hotspot analysis with explicit heuristic labeling;
- snapshot drift/diff;
- digest-bound evidence bundles;
- wide/deep/monorepo stress fixtures;
- offline interactive HTML report.

### NEXT / NEW

- additional workspace/build ecosystems;
- AST-grade import analysis;
- Git churn, ownership, test/coverage and richer complexity overlays;
- canonical Evidence Ledger persistence and ContextPack integration after its authority lands;
- richer treemap/graph interactions;
- thin MCP/machine-consumer adapter;
- production-like performance receipts and Shipping OS certification.

## Implemented contracts

- `repo-map/v1` — deterministic metadata-only repository snapshot;
- `repo-context-evidence/v1` — task-selected paths under an estimated token budget;
- `repo-topology/v1` — modules, package dependencies, JS/TS file imports and centrality;
- `repo-risk/v1` — deterministic structural hotspot signals;
- `repo-diff/v1` — exact previous/current snapshot drift;
- `repo-evidence-bundle/v1` — content-addressed references, provenance and claims;
- `repo-report/v1` — self-contained offline HTML view over the metadata contracts.

## Implementation slices

### M1 — map and bounded context

`packages/repo-intelligence/src/index.js`

- deterministic repository scanner;
- source-language classification and nonblank-line accounting;
- root/nested ignore rules;
- dependency/build/cache exclusions;
- binary filtering;
- symlink refusal/no traversal;
- fail-closed scan limits;
- deterministic map digest;
- lexical task relevance and estimated token budgets.

### M2 — topology

`packages/repo-intelligence/src/topology.js`

- `package.json` module discovery;
- workspace/internal package dependencies;
- external npm package nodes;
- deterministic JS/TS import/require/export-from extraction;
- relative import resolution;
- intra-module and cross-module relationships;
- module degree centrality.

### M3 — structural hotspots and evidence

`packages/repo-intelligence/src/risk.js` and `evidence.js`

- file hotspot scoring from size + import fan-in/fan-out;
- module hotspot scoring from size + dependency degree;
- methodology explicitly states that scores are structural heuristics, not vulnerability/defect probabilities;
- evidence bundles reference artifact digests rather than embedding source bodies;
- cross-repository and topology mismatches fail closed.

### M4 — snapshot drift

`packages/repo-intelligence/src/diff.js`

- added, removed and changed files;
- language and repository metric deltas;
- deterministic previous/current digest binding;
- drift evidence can only attach to a bundle whose current RepoMap matches exactly.

### M5 — offline report

`packages/repo-intelligence/src/report.js`

- one self-contained HTML artifact;
- no CDN, remote image, remote script, server or provider dependency;
- summary cards, language/directory distributions, searchable file metadata, module centrality, structural hotspots and optional drift;
- embedded data contains paths/metadata/relationships, not source bodies;
- script-breaking HTML characters are escaped before JSON embedding;
- report artifacts can stream to stdout or be written only through explicit `--output`.

## Read-only CLI

```text
npm run repo:atlas -- map <repo-path> [--output=<file>]
npm run repo:atlas -- topology <repo-path> [--output=<file>]
npm run repo:atlas -- context <repo-path> --task=<objective> [--max-files=24] [--max-tokens=24000]
npm run repo:atlas -- risk <repo-path> [--top=25]
npm run repo:atlas -- diff <previous-map.json> <current-map.json>
npm run repo:atlas -- bundle <repo-path> [--task=<objective>] [--previous-map=<repo-map.json>] [provenance flags]
npm run repo:atlas -- report <repo-path> [--previous-map=<repo-map.json>] [--title=<text>] [--output=<file.html>]
```

The CLI performs no provider/network writes. File artifacts are created only when an explicit output path is supplied.

## ContextPack integration rule

PR #195 remains the separate owner of the provider-neutral Delegation Runtime `ContextPack`. Repo Atlas does not define a competing ContextPack type.

```text
RepoMap / Topology / Risk / Diff
  → repo-evidence-bundle/v1
  → canonical Evidence Ledger ID
  → ContextPack.evidenceIds[]
  → bounded child agent
```

This leaves repository intelligence independently versioned while preserving one delegation authority.

## Security and privacy invariants

- source contents are never stored in RepoMap, topology, risk, diff or evidence-bundle artifacts;
- report data contains metadata/relationships, not source bodies;
- symlink roots are rejected and symlink entries are skipped;
- known dependency/build/cache directories are excluded by default;
- scans fail closed when configured bounds are exceeded;
- recognized NUL-containing binary-like files are excluded;
- context, topology, risk and drift artifacts are digest-bound to exact snapshots;
- evidence bundles reject mismatched snapshots;
- offline report JSON escapes script-breaking characters;
- source-content ContextPack materialization remains out of scope until secret scanning/redaction policy is canonical.

## Stress and adversarial coverage

The test corpus includes:

- 500+ recognized files in a wide repository;
- a deep tree that succeeds inside the configured depth and fails beyond it;
- explicit file-count and file-size limit failures;
- a synthetic 30-package monorepo plus root module;
- deterministic rescan/topology/diff/evidence results;
- symlink-root refusal and symlink-entry skipping;
- invalid package manifest failure;
- source-secret non-retention in map/evidence/report artifacts;
- adversarial `</script>` report title escaping;
- drift/evidence/report snapshot mismatch rejection.

## Current verification boundary

The latest verified report-capable head before this documentation-only update was `0e860d1500c853896a1cde8490a95a372f8dcdca`; GitHub Actions run `38952276975` passed both repository-wide `npm test` and `npm run acceptance` on that exact SHA.

This is implementation verification, not a claim of production deployment, shippability or Shipping OS certification. Any commit after that SHA requires a fresh exact-head receipt.

## Remaining gates

- support workspace/build ecosystems beyond npm `package.json` boundaries;
- replace/augment lexical JS/TS imports with parser-grade analysis;
- add Git churn/ownership, test/coverage and richer complexity overlays;
- integrate with canonical Evidence Ledger and ContextPack after their authority contract is merged;
- add richer interactive graph/treemap views if they materially improve navigation;
- expose a thin machine-consumer/MCP adapter without duplicating core logic;
- capture production-like scale/performance receipts;
- complete Shipping OS exact-SHA certification and deployment gates before any shippable/shipped claim.
