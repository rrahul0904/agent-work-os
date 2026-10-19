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

`Repository snapshot → map/topology/parser imports → semantic module resolution → risk/Git/drift → bounded semantic change impact → task context + evidence bundle → Evidence Ledger ID → ContextPack → bounded agent`

Repo Atlas is an Agent Work OS repository-intelligence capability, not a separate product authority.

## Donor behaviors retained as clean-room requirements

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
- privacy-preserving Git churn/ownership signals;
- parser-backed JS/TS dependency extraction with explicit lexical fallback provenance;
- static `tsconfig.json` / `jsconfig.json` alias and `baseUrl` resolution;
- workspace-package root/subpath resolution;
- bounded semantic change-impact propagation;
- digest-bound evidence bundles with explicit v1/v2 compatibility boundaries;
- wide/deep/monorepo stress fixtures;
- self-contained offline HTML report for M1–M8 evidence;
- bounded MCP tool surface rooted to an explicitly configured directory.

### NEXT / NEW

- workspace/build ecosystems beyond npm/TypeScript conventions;
- richer package `exports` / conditional export semantics without executing project code;
- test/coverage and richer complexity overlays;
- canonical Evidence Ledger persistence and ContextPack integration after its authority lands;
- richer graph/treemap interactions where they materially improve navigation;
- production-like resolution/impact performance receipts and Shipping OS certification.

## Implemented contracts

- `repo-map/v1` — deterministic metadata-only repository snapshot;
- `repo-context-evidence/v1` — task-selected paths under an estimated token budget;
- `repo-topology/v1` — modules, package dependencies, legacy deterministic JS/TS file-import topology and centrality;
- `repo-risk/v1` — deterministic structural hotspot signals;
- `repo-diff/v1` — exact previous/current snapshot drift;
- `repo-git-signals/v1` — bounded Git churn/ownership metadata with opaque contributor IDs;
- `repo-import-analysis/v1` — parser-backed JS/TS import metadata with parser/fallback provenance;
- `repo-impact/v1` — M8 bounded reverse-dependency blast radius over parser-resolved relative imports;
- `repo-module-resolution/v1` — M9 static alias/baseUrl/workspace resolution bound to exact parser-import evidence;
- `repo-impact/v2` — M9 bounded semantic blast radius over resolved repository-file edges;
- `repo-evidence-bundle/v1` — backward-compatible M1–M8 evidence references;
- `repo-evidence-bundle/v2` — M9 semantic resolution/impact evidence with stronger replay bindings;
- `repo-report/v1` — self-contained offline HTML view over M1–M8 metadata contracts.

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
- deterministic legacy JS/TS import/require/export-from extraction;
- relative import resolution;
- intra-module and cross-module relationships;
- module degree centrality.

`repo-topology/v1` remains unchanged through M9. Parser-grade and semantic dependency evidence are additive contracts rather than silent topology-schema mutations.

### M3 — structural hotspots and evidence

`packages/repo-intelligence/src/risk.js` and `evidence.js`

- file hotspot scoring from size + import fan-in/fan-out;
- module hotspot scoring from size + dependency degree;
- scores are structural heuristics, not vulnerability/defect probabilities;
- v1 evidence bundles reference artifact digests rather than source bodies;
- cross-repository and dependency mismatches fail closed.

### M4 — snapshot drift

`packages/repo-intelligence/src/diff.js`

- added, removed and changed files;
- language and repository metric deltas;
- deterministic previous/current digest binding;
- drift evidence can attach only when its current RepoMap matches exactly.

### M5 — offline report

`packages/repo-intelligence/src/report.js`

- one self-contained HTML artifact;
- no CDN, remote image, remote script, server or provider dependency;
- summary cards, language/directory distributions, searchable file metadata, module centrality, structural hotspots, Git signals and optional drift;
- M8 parser import coverage and change-impact sections through explicit report flags;
- embedded data contains paths/metadata/relationships, not source bodies;
- script-breaking HTML characters are escaped before JSON embedding;
- report artifacts stream to stdout or are written only through explicit `--output`.

M9 deliberately does not mutate `repo-report/v1`; a semantic-report contract can be versioned separately if richer alias-resolution visualization materially improves navigation.

### M6 — bounded MCP v2 adapter

`packages/repo-intelligence/src/mcp.js` and `scripts/repo-atlas-mcp.mjs`

- official `@modelcontextprotocol/server` v2 SDK with stdio transport;
- explicit configured root through `--root` or `REPO_ATLAS_ROOT`;
- configured-root symlinks are rejected;
- lexical and physical realpath boundary checks prevent `../` and symlink escapes;
- compact tool responses avoid dumping complete repository state into model context;
- real-process integration tests use the official MCP client/stdio transport and modern `2026-07-28` protocol negotiation.

Current read-only tools:

1. `repo_atlas_overview`
2. `repo_atlas_context`
3. `repo_atlas_topology`
4. `repo_atlas_imports`
5. `repo_atlas_resolution`
6. `repo_atlas_hotspots`
7. `repo_atlas_git_signals`
8. `repo_atlas_drift`
9. `repo_atlas_impact`
10. `repo_atlas_semantic_impact`
11. `repo_atlas_bundle`
12. `repo_atlas_semantic_bundle`

### M7 — privacy-preserving Git signals

`packages/repo-intelligence/src/git-signals.js`

- read-only local Git history analysis through bounded `git` subprocesses;
- configurable commit cap, timeout and output-buffer limits;
- exact HEAD commit and dirty-working-tree state;
- tracked recognized files, commit touches, additions/deletions/churn and last-change timestamp;
- contributor counts and top-contributor signal use SHA-256-derived opaque IDs;
- author email addresses are never emitted into Repo Atlas artifacts;
- timestamps are normalized to canonical UTC;
- Git signals flow through CLI, MCP, evidence bundles and offline reports.

### M8 — parser-backed imports and bounded change impact

`packages/repo-intelligence/src/import-analysis.js` and `impact.js`

Parser import analysis:

- uses `@typescript/typescript6` `6.0.2` for JS/TS/JSX/TSX parsing;
- classifies static imports, type imports, export-from, type export-from, dynamic imports, CommonJS `require`, and TypeScript import-equals;
- resolves local relative imports against exact recognized RepoMap files;
- records package references without executing imported code;
- records non-literal dynamic imports rather than guessing targets;
- parser errors switch only affected files to explicit `lexical-fallback` with diagnostic counts;
- parser mode avoids false edges from import-like strings/comments;
- source text is transient parser input and is never retained.

Change impact v1:

- traverses reverse parser-resolved relative-file imports from current changed/added files;
- hard-bounds propagation depth (`1..20`, default `5`);
- separates direct and transitive dependents;
- optionally includes topology and privacy-preserving Git churn signals;
- cycles are deterministic;
- removed-file downstream propagation is intentionally not inferred without previous-snapshot dependency evidence.

### M9 — semantic module resolution and impact evidence

`packages/repo-intelligence/src/module-resolution.js`, `impact-v2.js`, and `evidence-v2.js`

#### `repo-module-resolution/v1`

- consumes exact `repo-import-analysis/v1` evidence rather than reparsing an independent graph;
- statically reads repository-local `tsconfig.json` / `jsconfig.json`;
- resolves `compilerOptions.paths` exact/single-wildcard aliases;
- resolves `baseUrl` imports;
- follows only repository-local relative `extends`, with a hard depth bound and explicit cycle rejection;
- package-based `extends` are recorded as external/unsupported rather than loaded from dependency trees;
- discovers workspace packages from repository `package.json` files;
- resolves package roots using bounded metadata (`types`, `typings`, `module`, `main`, simple root export, `src/index`, `index`);
- resolves workspace package subpaths against exact RepoMap files;
- records resolution provenance per import: `relative-file`, `tsconfig-path`, `base-url`, `workspace-package`, `external-package`, or explicit unresolved state;
- never executes config or project code;
- config/package reads enforce lexical containment, regular non-symlink final files and physical realpath containment;
- source/config bodies are not retained in the artifact.

#### `repo-impact/v2`

- builds reverse dependency propagation from semantic `targetFile` resolutions;
- makes tsconfig/baseUrl/workspace aliases participate in blast radius;
- remains depth-bounded (`1..20`), cycle-safe and deterministic;
- binds exactly to RepoMap, parser-import analysis, semantic resolution and diff;
- additionally binds topology/Git when supplied;
- exposes semantic-resolution coverage metrics alongside impact metrics;
- remains a structural heuristic, never a defect/vulnerability/failure probability;
- removed-file propagation remains explicitly unsupported without previous semantic-resolution evidence.

#### `repo-evidence-bundle/v2`

- leaves `repo-evidence-bundle/v1` untouched for backward compatibility;
- adds `repo-resolution` and `repo-semantic-impact` artifact references;
- requires resolution to match the exact parser-import digest;
- requires semantic impact to match exact parser imports, module resolution and diff;
- if impact declares topology/Git bindings, those exact artifacts must be supplied to make the bundle replayable;
- emits semantic-resolution and semantic-impact claims without source bodies;
- producer `contractVersion` is explicitly `2`.

## Read-only CLI

```text
npm run repo:atlas -- map <repo-path> [--output=<file>]
npm run repo:atlas -- topology <repo-path> [--output=<file>]
npm run repo:atlas -- imports <repo-path> [--output=<file>]
npm run repo:atlas -- resolve <repo-path> [--output=<file>]
npm run repo:atlas -- impact <repo-path> --previous-map=<repo-map.json> [--max-depth=5] [--include-git]
npm run repo:atlas -- semantic-impact <repo-path> --previous-map=<repo-map.json> [--max-depth=5] [--include-git]
npm run repo:atlas -- context <repo-path> --task=<objective> [--max-files=24] [--max-tokens=24000]
npm run repo:atlas -- risk <repo-path> [--top=25]
npm run repo:atlas -- git <repo-path> [--max-commits=500]
npm run repo:atlas -- diff <previous-map.json> <current-map.json>
npm run repo:atlas -- bundle <repo-path> [--task=<objective>] [--previous-map=<repo-map.json>] [--include-git] [--include-imports] [--include-impact] [--max-depth=5] [provenance flags]
npm run repo:atlas -- semantic-bundle <repo-path> [--task=<objective>] [--previous-map=<repo-map.json>] [--include-git] [--max-depth=5] [provenance flags]
npm run repo:atlas -- report <repo-path> [--previous-map=<repo-map.json>] [--include-git] [--include-imports] [--include-impact] [--max-depth=5] [--title=<text>] [--output=<file.html>]
npm run repo:atlas:mcp -- --root=<directory>
```

The CLI and MCP server perform no provider/network writes. File artifacts are created only through explicit CLI output paths; MCP tools are read-only.

## ContextPack integration rule

PR #195 remains the separate owner of the provider-neutral Delegation Runtime `ContextPack` and is still open, draft and unmerged as of the M9 verification pass. Repo Atlas does not define a competing ContextPack type.

```text
RepoMap / Topology / Imports / Resolution / Risk / Git / Diff / Semantic Impact
  → repo-evidence-bundle/v2
  → canonical Evidence Ledger ID
  → ContextPack.evidenceIds[]
  → bounded child agent
```

Until that authority merges, Repo Atlas stops at content-addressed evidence artifacts/bundles; it does not persist or inject a substitute ContextPack.

## Security and privacy invariants

- source contents are never stored in RepoMap, topology, parser-import, module-resolution, risk, Git, diff, impact or evidence-bundle artifacts;
- parser source text and config/package text are read transiently and discarded after metadata extraction;
- symlink roots are rejected and repository scan symlink entries are skipped;
- parser/resolver file reads verify lexical containment, regular non-symlink final files and physical realpath containment;
- MCP checks lexical and physical paths against its configured root;
- no project code, package code or config code is executed by semantic resolution;
- package-based tsconfig extends are not loaded from dependencies;
- known dependency/build/cache directories remain excluded by default;
- scans and Git history analysis fail closed at configured bounds;
- contributor email addresses are transformed to opaque hashes before entering artifacts;
- all semantic evidence is digest-bound to the exact upstream artifacts used to derive it;
- v2 evidence rejects missing/mismatched reproducibility dependencies;
- source-content ContextPack materialization remains out of scope until secret scanning/redaction policy is canonical.

## Stress and adversarial coverage

The test corpus now includes:

- 500+ recognized files in a wide repository;
- depth/file-count/file-size fail-closed limits;
- synthetic 30-package monorepo coverage;
- deterministic map/topology/diff/evidence/Git/parser/impact/resolution digests;
- symlink-root refusal and symlink-entry skipping;
- invalid package manifest failure;
- source-secret non-retention across map/evidence/report/parser/resolution/CLI/MCP artifacts;
- adversarial report JSON/script escaping;
- parser false-positive rejection for comment/string import text;
- malformed JS/TS explicit lexical fallback;
- dynamic, type-only, export-from, CommonJS and scoped-package imports;
- tsconfig `paths` and `baseUrl` resolution;
- workspace package root and subpath resolution;
- bounded local tsconfig extends plus package-extends non-loading;
- local config-extends cycle rejection;
- alias-aware direct/transitive impact propagation;
- impact depth bounding and cyclic dependency coverage;
- cross-snapshot/import/resolution/diff/topology/Git mismatch rejection;
- v1/v2 evidence-bundle separation;
- contributor-email non-retention across artifacts, bundles, report, CLI and MCP;
- real MCP process tool discovery/calls plus configured-root escape denial.

## Verification boundary

The latest M9 implementation head before this documentation-only update is `8a4369f7335bf6a2e7b98e72e4695aa3dc5dca33`.

GitHub Actions run `39003800838` passed on that exact SHA:

- repository-wide `npm test` — **passed**;
- `npm run acceptance` — **passed**.

Earlier M9 checkpoints separately proved the core resolver/impact contracts and the semantic evidence-bundle binding layer before those surfaces were integrated. A pre-existing control-plane identity lifecycle timing assertion (`processing` vs `complete`) flaked on two earlier M9 runs; every Repo Atlas test passed in those runs, the exact same assertion had appeared before M9, and the final implementation run above passed without weakening or changing that unrelated test.

The branch must receive one additional exact-head CI receipt after this dossier commit before PR metadata is treated as the final M9 verification record. Verification does **not** imply production deployment, shippability or Shipping OS certification.

## Remaining gates

- support workspace/build ecosystems beyond npm/TypeScript boundaries (`pnpm`, Yarn workspace metadata, Go workspaces/modules, Cargo, Maven/Gradle, .NET, Python packaging, Terraform/Compose/Kubernetes ownership);
- enrich package `exports` / conditional export resolution without executing package code;
- add test/coverage and richer complexity overlays;
- add a separately versioned semantic report/graph surface only if it materially improves navigation;
- integrate with canonical Evidence Ledger and ContextPack after their authority contract is merged;
- capture production-like semantic-resolution and impact scale/performance receipts;
- complete Shipping OS exact-SHA certification and deployment gates before any shippable/shipped claim.
