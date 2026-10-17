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

`Repository snapshot → map/topology/parser imports/risk/Git/drift → bounded change impact → task context + evidence bundle → Evidence Ledger ID → ContextPack → bounded agent`

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
- bounded change-impact propagation over exact import edges;
- digest-bound evidence bundles;
- wide/deep/monorepo stress fixtures;
- self-contained offline HTML report including parser/impact evidence;
- bounded MCP v2 tool surface rooted to an explicitly configured directory.

### NEXT / NEW

- additional workspace/build ecosystems;
- semantic/package-resolution improvements beyond local relative JS/TS file resolution;
- test/coverage and richer complexity overlays;
- canonical Evidence Ledger persistence and ContextPack integration after its authority lands;
- richer graph/treemap interactions where they materially improve navigation;
- production-like parser/impact performance receipts and Shipping OS certification.

## Implemented contracts

- `repo-map/v1` — deterministic metadata-only repository snapshot;
- `repo-context-evidence/v1` — task-selected paths under an estimated token budget;
- `repo-topology/v1` — modules, package dependencies, legacy deterministic JS/TS file-import topology and centrality;
- `repo-risk/v1` — deterministic structural hotspot signals;
- `repo-diff/v1` — exact previous/current snapshot drift;
- `repo-git-signals/v1` — bounded Git churn/ownership metadata with opaque contributor IDs;
- `repo-import-analysis/v1` — parser-backed JS/TS import metadata with parser/fallback provenance;
- `repo-impact/v1` — bounded reverse-dependency blast radius for changed/added current files;
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
- deterministic legacy JS/TS import/require/export-from extraction;
- relative import resolution;
- intra-module and cross-module relationships;
- module degree centrality.

`repo-topology/v1` remains unchanged in M8 to protect existing consumers. Parser-grade dependency evidence is additive through `repo-import-analysis/v1` rather than silently changing topology semantics.

### M3 — structural hotspots and evidence

`packages/repo-intelligence/src/risk.js` and `evidence.js`

- file hotspot scoring from size + import fan-in/fan-out;
- module hotspot scoring from size + dependency degree;
- methodology explicitly states scores are structural heuristics, not vulnerability/defect probabilities;
- evidence bundles reference artifact digests rather than embedding source bodies;
- cross-repository and topology mismatches fail closed.

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
- M8 parser import coverage and change-impact sections are available through explicit report flags;
- embedded data contains paths/metadata/relationships, not source bodies;
- script-breaking HTML characters are escaped before JSON embedding;
- static Git and parser summaries are pre-rendered before browser JavaScript executes;
- report artifacts stream to stdout or are written only through explicit `--output`.

### M6 — bounded MCP v2 adapter

`packages/repo-intelligence/src/mcp.js` and `scripts/repo-atlas-mcp.mjs`

- official `@modelcontextprotocol/server` v2 SDK with stdio transport;
- explicit configured root through `--root` or `REPO_ATLAS_ROOT`;
- configured-root symlinks are rejected;
- lexical and physical realpath boundary checks prevent `../` and symlink escapes;
- compact tool responses avoid dumping complete repository state into model context;
- current tools: overview, task context, topology, parser imports, structural hotspots, Git signals, drift, change impact and evidence bundle;
- real-process integration tests use the official MCP client/stdio transport and modern `2026-07-28` protocol negotiation.

### M7 — privacy-preserving Git signals

`packages/repo-intelligence/src/git-signals.js`

- read-only local Git history analysis through bounded `git` subprocesses;
- configurable commit cap, timeout and output-buffer limits;
- exact HEAD commit and dirty-working-tree state;
- tracked recognized files, commit touches, additions/deletions/churn and last-change timestamp;
- contributor counts and top-contributor signal use SHA-256-derived opaque IDs;
- author email addresses are never emitted into Repo Atlas artifacts;
- timestamps are normalized to a canonical UTC representation;
- Git signals flow through CLI, MCP, evidence bundles and offline reports.

### M8 — parser-backed imports and bounded change impact

`packages/repo-intelligence/src/import-analysis.js` and `impact.js`

Parser import analysis:

- uses the TypeScript 6 compiler API compatibility package `@typescript/typescript6` (`6.0.2`) for JS/TS/JSX/TSX parsing;
- classifies static imports, type imports, export-from, type export-from, dynamic imports, CommonJS `require`, and TypeScript import-equals;
- resolves local relative imports against exact recognized RepoMap files;
- records package references without executing or loading imported code;
- records non-literal dynamic-import counts rather than guessing a target;
- parser errors are explicit: affected files switch to `lexical-fallback` and retain a diagnostic count;
- parser mode avoids false edges from import-like strings and comments;
- file reads are lexical- and realpath-confined to the repository root;
- source text is transient parser input and is never retained in the artifact.

Change impact:

- traverses reverse resolved-file imports from current changed/added files;
- hard-bounds propagation depth (`1..20`, default `5`);
- separates direct and transitive dependents;
- records impacted module boundaries when topology is supplied;
- can incorporate privacy-preserving Git churn as one scoring signal;
- scores are explicitly structural blast-radius heuristics, not defect, vulnerability or failure probabilities;
- cycles are handled deterministically;
- removed-file downstream propagation is intentionally not inferred without a previous-snapshot import-analysis artifact;
- every impact artifact is digest-bound to RepoMap, import analysis, diff and any supplied topology/Git artifact.

M8 is additive. Existing `repo-topology/v1` consumers do not need a schema migration.

## Read-only CLI

```text
npm run repo:atlas -- map <repo-path> [--output=<file>]
npm run repo:atlas -- topology <repo-path> [--output=<file>]
npm run repo:atlas -- imports <repo-path> [--output=<file>]
npm run repo:atlas -- impact <repo-path> --previous-map=<repo-map.json> [--max-depth=5] [--include-git]
npm run repo:atlas -- context <repo-path> --task=<objective> [--max-files=24] [--max-tokens=24000]
npm run repo:atlas -- risk <repo-path> [--top=25]
npm run repo:atlas -- git <repo-path> [--max-commits=500]
npm run repo:atlas -- diff <previous-map.json> <current-map.json>
npm run repo:atlas -- bundle <repo-path> [--task=<objective>] [--previous-map=<repo-map.json>] [--include-git] [--include-imports] [--include-impact] [--max-depth=5] [provenance flags]
npm run repo:atlas -- report <repo-path> [--previous-map=<repo-map.json>] [--include-git] [--include-imports] [--include-impact] [--max-depth=5] [--title=<text>] [--output=<file.html>]
npm run repo:atlas:mcp -- --root=<directory>
```

The CLI and MCP server perform no provider/network writes. File artifacts are created only through explicit CLI output paths; MCP tools are read-only.

## ContextPack integration rule

PR #195 remains the separate owner of the provider-neutral Delegation Runtime `ContextPack` and is still draft/unmerged as of the M8 verification pass. Repo Atlas does not define a competing ContextPack type.

```text
RepoMap / Topology / Imports / Risk / Git / Diff / Impact
  → repo-evidence-bundle/v1
  → canonical Evidence Ledger ID
  → ContextPack.evidenceIds[]
  → bounded child agent
```

This leaves repository intelligence independently versioned while preserving one delegation authority.

## Security and privacy invariants

- source contents are never stored in RepoMap, topology, parser-import, risk, Git, diff, impact or evidence-bundle artifacts;
- parser source text is read transiently and discarded after metadata extraction;
- report data contains metadata/relationships, not source bodies;
- symlink roots are rejected and repository scan symlink entries are skipped;
- parser file reads verify lexical containment, regular non-symlink final files and physical realpath containment;
- MCP additionally checks both lexical paths and physical realpaths against its configured root;
- known dependency/build/cache directories are excluded by default;
- scans and Git history analysis fail closed at configured bounds;
- recognized NUL-containing binary-like files are excluded;
- context, topology, parser imports, risk, Git, drift and impact artifacts are digest-bound to exact snapshots/evidence dependencies;
- evidence bundles reject mismatched snapshots and mismatched impact dependencies;
- contributor email addresses are transformed to opaque hashes before entering artifacts;
- offline report JSON escapes script-breaking characters;
- source-content ContextPack materialization remains out of scope until secret scanning/redaction policy is canonical.

## Stress and adversarial coverage

The test corpus includes:

- 500+ recognized files in a wide repository;
- a deep tree that succeeds inside the configured depth and fails beyond it;
- explicit file-count and file-size limit failures;
- a synthetic 30-package monorepo plus root module;
- deterministic rescan/topology/diff/evidence/Git/parser/impact results;
- symlink-root refusal and symlink-entry skipping;
- invalid package manifest failure;
- source-secret non-retention in map/evidence/report/parser/MCP artifacts;
- adversarial `</script>` report title escaping;
- drift/evidence/report snapshot mismatch rejection;
- Git artifact-to-RepoMap mismatch rejection;
- parser import false-positive checks for comment/string import text;
- malformed JS/TS explicit lexical-fallback coverage;
- dynamic, type-only, export-from, CommonJS and scoped-package import classification;
- impact-depth bounding and cyclic dependency coverage;
- impact/import/diff cross-snapshot mismatch rejection;
- contributor-email non-retention across Git artifacts, evidence bundles, reports, CLI and MCP;
- real MCP process tool discovery/calls, parser-import and impact calls, plus root-escape denial;
- offline M8 report verification for parser coverage, change impact and source-secret non-retention.

## Verification boundary

The latest implementation head before this documentation-only update is `470d923c36a8c157c69a7a54414b499b1b3441fa`. GitHub Actions run `38996024406` passed repository-wide `npm test` and `npm run acceptance` on that exact SHA, including the M8 parser/import, impact, CLI, real MCP and offline-report tests.

An earlier M8 integration run exposed a transient unrelated control-plane identity timing assertion. Current `main` (`46f3b8a9101fe228268f1ca6a36b89eb5820474b`) independently passed full tests and acceptance in run `38995778081`, and the fully synchronized Repo Atlas branch subsequently passed the same gates. No control-plane test was weakened or changed by Repo Atlas.

The branch must receive one additional exact-head CI receipt after this dossier commit before PR metadata is treated as the final M8 verification record. Verification here does **not** imply production deployment, shippability or Shipping OS certification.

## Remaining gates

- support workspace/build ecosystems beyond npm `package.json` boundaries;
- add richer semantic/module resolution (aliases, tsconfig paths and ecosystem-specific resolution) without executing project code;
- add test/coverage and richer complexity overlays;
- integrate with canonical Evidence Ledger and ContextPack after their authority contract is merged;
- add richer interactive graph/treemap views if they materially improve navigation;
- capture production-like parser/impact scale and performance receipts;
- complete Shipping OS exact-SHA certification and deployment gates before any shippable/shipped claim.
