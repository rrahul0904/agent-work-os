# Presentation OS — PPT Master reverse-engineering dossier

Status: UNDERSTAND / DEFINE
Issue: #142
Donor: `hugohe3/ppt-master`
Source post: `r/BestGitHubRepos` — “PPT Master: AI generates native PowerPoint from any document”
Clean-room mode: required

## 1. Executive thesis

PPT Master proves that an agent-driven workflow can generate or edit a real PowerPoint package rather than flattening slides into images. Its strongest idea is **native depth**: editable shapes, text, charts/tables, slide masters/layouts, transitions, animations, notes, narration, and template-preserving workflows.

Presentation OS should keep that product truth but change the product shape.

Our target is not a prompt pack or a clone. It is a governed presentation platform inside Agent Work OS: a persistent project workspace with deterministic contracts, native PPTX compilation and round-trip editing, brand and accessibility policy, data lineage, semantic slide diffs, review/approval workflows, replayable generation, and exact-SHA verification receipts.

## 2. Evidence set

Primary evidence used for this dossier:

- Reddit launch post and quoted README claims.
- Public donor repository and README.
- Public donor `SKILL.md` and routing/generation documentation.
- Public donor roadmap / native-coverage map.
- Public donor issues, especially setup cost, diagnostics, language drift, and conversion collisions.
- Microsoft PowerPoint/Copilot product documentation.
- Gamma import/export documentation and changelog.
- Agent Work OS current architecture and verification model.

Do not treat donor internals as an implementation recipe. They are evidence of behavior, constraints, and product trade-offs only.

## 3. Donor product anatomy

### 3.1 Product surface

PPT Master is primarily a local workflow/skill executed by an agent-capable environment. It is not a conventional hosted presentation editor.

The donor exposes three top-level artifact lifecycles:

1. Generate PPTX.
2. Create Template.
3. Edit Native PPTX.

Generation itself contains specialized profiles for image-to-PPTX reconstruction, beautification, quick generation, research, preview, animation, narration, and other supporting stages.

### 3.2 Core pipeline

Observed high-level flow:

`source intake -> normalization/research -> project init -> template candidate selection -> narrative/design strategy -> SVG/page authoring -> quality gates -> PPTX export -> optional notes/animation/audio`

The critical implementation boundary is that slide design is materialized as explicit page/object artifacts before packaging. The export step compiles those artifacts into OOXML/PowerPoint structures.

### 3.3 Native-depth thesis

The donor emphasizes PowerPoint-native editability rather than rasterized slides. Current public claims include native/editable:

- text and runs;
- vector shapes;
- lines/connectors;
- charts and tables;
- equations/OMML;
- hyperlinks and same-deck navigation;
- slide masters and layouts in structured routes;
- placeholders in template-aware routes;
- notes and narration;
- transitions and selected object animations.

### 3.4 Data / source ingestion

The donor supports topic-only generation and common office/document inputs. Its workflow includes source conversion, archival/normalization, research for factual gaps, project-scoped assets, and optional template extraction.

### 3.5 Agent orchestration

The workflow has explicit routing, plan/do/check/act phases, user confirmation gates, role-specific references, and validation/recovery rules. This is a meaningful strength: the project treats presentation generation as a workflow with contracts rather than one giant prompt.

## 4. Donor strengths worth preserving

### A. Native PPTX as the output contract

Editable PowerPoint is the right target. Users should be able to continue working normally after generation.

### B. Separate generate / template / native-edit lifecycles

The distinction prevents destructive “one workflow does everything” behavior.

### C. Source-preserving edits

Round-trip editing that leaves untouched material unchanged is the right model for real corporate decks.

### D. Deterministic routing and gates

Product behavior is more reliable when requests resolve to bounded workflows with explicit preconditions.

### E. Honest capability map

The donor documents native coverage and non-goals rather than claiming complete PowerPoint parity.

### F. Local-first execution

Corporate decks may contain sensitive material. Keeping repository/files on the user machine while the control plane orchestrates work is aligned with Agent Work OS.

## 5. Donor gaps and pain signals

### 5.1 High setup / cognitive cost

A public issue explicitly describes the repository as heavy and difficult to get running, requesting better tutorials. The workflow also requires the user to understand an agent host, Python/runtime setup, project conventions, and multiple routes.

**Our response:** productize setup behind Agent Work OS daemon capability discovery and one-click project flows.

### 5.2 Fail-closed diagnostics can be opaque

A Windows issue reports the required integrity gate exiting non-zero without stdout/stderr.

**Our response:** every blocking gate must produce a machine-readable failure code, human diagnosis, repair recommendation, and receipt.

### 5.3 Accessibility is explicitly outside the donor path

The donor roadmap says full accessibility authoring is not planned.

**Our response:** accessibility becomes a first-class compiler/verifier layer, not a final checklist.

### 5.4 Collaboration/review is explicitly outside scope

Comments, revisions, and collaboration state are not part of the donor product direction.

**Our response:** semantic slide review, decisions, approvals, revisions, and evidence receipts are core Presentation OS objects.

### 5.5 Newly authored connectors are not behaviorally bound

The donor exports connector geometry but intentionally does not bind newly authored edges to nodes.

**Our response:** diagrams use an explicit graph model (`node`, `port`, `edge`, `routing`) so native connectors remain attached when shapes move.

### 5.6 Template refill is deliberately narrow

Arbitrary schema-free placeholder refill is a donor non-goal.

**Our response:** do not blindly mutate third-party decks either. Instead infer/confirm a semantic template contract and expose mapping confidence + unresolved slots before any write.

### 5.7 Localization drift

Public issues document UI terminology and translated-doc drift.

**Our response:** locale message catalogs, terminology registry, generated key parity tests, and snapshot checks in CI.

### 5.8 Source-conversion collision risk

A public issue documents same-stem Excel batch output overwriting earlier artifacts.

**Our response:** every imported artifact receives a content-addressed ID and immutable source record; filenames are display metadata only.

## 6. Competitive product signals

### Microsoft PowerPoint + Copilot

Microsoft now supports creating presentations from prompts/files and can reference existing presentations for content/style reuse. Agent Mode can use Work IQ to gather authorized organizational context.

Implication: “AI makes slides” is commodity. Presentation OS must win on deterministic generation, local-first control, cross-model support, provenance, policy, replay, and engineering-grade verification.

### Gamma

Gamma 5 supports faithful PPTX/PDF import into an editable Gamma workspace and exports PowerPoint. Its current export supports editable tables, but it documents PowerPoint export differences and does not include PowerPoint slide masters in exported files.

Implication: web-native UX is a strong benchmark, but Presentation OS should preserve true native PowerPoint structure and expose export-certification evidence.

## 7. Better-than-donor feature contract

### MATCH

- Topic/source -> editable PPTX.
- Existing deck -> preserve/edit.
- Reusable brand/style/layout/deck semantics.
- Native text/shapes/charts/tables.
- Notes, transitions, animation, narration.
- Local-first execution.
- Multiple model providers.

### IMPROVE

#### Setup

- One Agent Work OS capability install / runtime bootstrap.
- Automatic dependency and font checks.
- Diagnosable gates.
- No need to understand internal route files.

#### UX

- Persistent presentation projects.
- Browser project cockpit.
- Narrative outline -> slide plan -> live preview -> review -> export.
- Slide/object inspector.
- Source/evidence panel.
- Repair actions attached to failed checks.

#### Reliability

- Immutable source IDs.
- Versioned schema contracts.
- Idempotent pipeline stages.
- Replay from locked plan.
- Stage checkpoints and restart reconciliation.
- Independent verifier.

#### Native fidelity

- Native charts/tables by default when supported.
- Real masters/layouts when a template contract exists.
- Bound diagram connectors.
- Explicit placeholder semantics.
- No silent raster fallback for a promised-native object.

#### Template/brand

- Extract design tokens, font roles, spacing, palettes, layouts, component vocabulary, and logo rules.
- Confidence-scored inference.
- Brand policy validator with explainable violations.

### NEW

#### Accessibility compiler

- alt text contract;
- contrast checks;
- reading-order checks;
- minimum type-size policy;
- chart descriptions;
- table semantics;
- accessibility score and repair loop.

#### Semantic deck graph

Represent:

`source -> evidence -> claim -> narrative section -> slide -> object -> data source`

This graph powers provenance, citations, stale-data warnings, and impact analysis.

#### Data lineage + refresh

Charts/tables retain source references, extraction steps, transformations, refresh timestamps, and validation state.

#### Collaboration and governance

- reviewers;
- slide/object comments;
- decision log;
- change requests;
- approval gates;
- semantic deck diff;
- revision lineage;
- publish/export approval.

#### Quality scoring

Per-slide and deck-level checks:

- overflow/collision;
- alignment/grid;
- density;
- hierarchy;
- brand compliance;
- accessibility;
- unsupported claims;
- missing citations;
- chart integrity;
- export/native-object compliance;
- renderer visual regression.

#### Multi-agent review

Bounded roles over persisted contracts:

1. researcher;
2. narrative architect;
3. brand analyst;
4. slide designer;
5. PPTX compiler;
6. visual verifier;
7. accessibility reviewer;
8. fact/provenance reviewer;
9. release certifier.

No role may self-certify the output it authored.

## 8. Clean-room architecture

### `packages/presentation-contracts`

Versioned schemas for:

- `DeckProject`;
- `SourceArtifact`;
- `EvidenceItem`;
- `DeckPlan`;
- `SlidePlan`;
- `SlideObject`;
- `DiagramGraph`;
- `ChartSpec`;
- `TableSpec`;
- `BrandSystem`;
- `TemplateContract`;
- `AccessibilityMetadata`;
- `QualityFinding`;
- `RenderReceipt`;
- `ExportReceipt`.

### `packages/presentation-core`

Deterministic domain logic:

- plan validation;
- layout constraints;
- object graph transforms;
- slide numbering / ordering;
- source lineage;
- semantic diff;
- deterministic IDs.

No model calls in this package.

### `packages/presentation-ingest`

Adapters for:

- Markdown/text;
- PDF;
- DOCX;
- PPTX;
- XLSX/CSV;
- HTML/URL;
- images.

Every import creates immutable content-addressed source records.

### `packages/presentation-pptx`

Independent OOXML compiler + round-trip reader.

Responsibilities:

- package relationships;
- themes;
- masters/layouts;
- slides;
- text/shapes;
- native tables/charts;
- notes;
- hyperlinks;
- accessibility metadata;
- media relationships;
- source-preserving edit planning.

### `packages/presentation-quality`

- schema validation;
- package validation;
- visual regression;
- editability checks;
- accessibility;
- brand compliance;
- factual/evidence completeness;
- chart/table data consistency.

### `packages/presentation-agents`

LLM-backed roles that emit or revise versioned contracts only. The model never writes arbitrary OOXML directly.

### Agent Work OS web app

Add Presentation project screens:

- Sources;
- Outline;
- Slides;
- Brand;
- Data;
- Review;
- Quality;
- Export receipts.

### Local daemon

Host-dependent capabilities remain local:

- font inventory;
- optional LibreOffice/PowerPoint render adapters;
- Office-specific validation when available;
- local file access;
- image/media tools.

## 9. Phase A vertical slice

### Inputs

- Markdown or DOCX/PDF normalized to internal text blocks.
- Optional brand reference PPTX.

### Output

6–10 slide `.pptx` containing:

- editable title/body text;
- native shapes;
- one native chart;
- one native table;
- speaker notes;
- source/evidence provenance sidecar;
- alt text for every non-text semantic object;
- browser preview;
- deterministic receipt bundle.

### Required tests

1. schema tests;
2. deterministic-ID tests;
3. package-open test;
4. OOXML relationship test;
5. text editability test;
6. shape editability test;
7. chart workbook/data-binding test;
8. table editability test;
9. accessibility metadata test;
10. render visual regression;
11. replay test from locked plan;
12. malformed-input negative tests.

## 10. Shipping contract

A feature is not SHIPPED because a PPTX exists.

Required evidence chain:

`source receipt -> plan receipt -> object-graph receipt -> compiler receipt -> package validation -> visual regression -> accessibility/brand checks -> exact commit SHA -> CI -> runtime/deployment receipt -> operator UAT -> tracker promotion`

Statuses must distinguish:

- RESEARCHED;
- SPECIFIED;
- IMPLEMENTED_LOCAL;
- CI_GREEN;
- RUNTIME_VERIFIED;
- UAT_VERIFIED;
- SHIPPED.

## 11. Phase roadmap

### Phase A — contracts + native MVP

Fixture corpus, schemas, deterministic deck plan/object graph, minimal PPTX compiler, native text/shapes/chart/table, verification.

### Phase B — ingestion + narrative engine

PDF/DOCX/XLSX/PPTX/URL source normalization, evidence graph, bounded research, narrative planner.

### Phase C — brand/template intelligence

Brand token extraction, semantic layouts, native masters/layouts/placeholders, policy checker.

### Phase D — editor + repair loop

Browser slide workspace, object inspector, findings panel, targeted regenerate/repair.

### Phase E — source-preserving round trip

Existing PPTX ingest, immutable unchanged parts, planned object/slide edits, byte-preservation receipts where applicable.

### Phase F — collaboration + governance

Comments, decisions, change requests, approvals, semantic diff/revision history.

### Phase G — advanced PowerPoint behavior

Transitions, animation, narration, audio/video, navigation, advanced diagram support.

### Phase H — integrations

Agent Work OS API, desktop shell, PowerPoint add-in/plugin, optional Google/Canva/Gamma-adjacent import/export adapters where technically and legally appropriate.

## 12. Explicit non-goals for the first release

- unrestricted VBA/macro generation;
- arbitrary OLE/3D/camera objects;
- silent destructive mutation of user PPTX files;
- unrestricted shell/network from generation workers;
- claiming visual parity without renderer evidence;
- claiming editability without native-object tests;
- claiming SHIPPED based only on local tests.

## 13. First engineering tasks

1. Define JSON Schema/TypeScript contracts for `DeckPlan`, `SlidePlan`, `SlideObject`, `SourceArtifact`, `EvidenceItem`, `ExportReceipt`.
2. Add a small copyright-safe fixture corpus authored for this project.
3. Implement deterministic object IDs and validation.
4. Implement a minimal PPTX package writer for text + rectangle/line/picture primitives.
5. Add native table and chart primitives.
6. Add package validator + unzip inspection tests.
7. Add a renderer abstraction and golden-image regression harness.
8. Add accessibility metadata fields + checks.
9. Add Agent Work OS task type `presentation.generate` backed by persisted plan/contracts.
10. Record exact-SHA verification receipts before advancing to Phase B.
