# Visual Intelligence Platform — canonical product boundary

Status: BUILDING (Phase A product shell + Prompt Studio)

## Mission

Build one hosted, provider-neutral visual creation platform on top of Agent Work OS. The platform uses governed AI agents, skills, plugins, APIs and MCP adapters to turn prompts, documents, data, code and existing artifacts into editable visual deliverables.

Primary artifact families:

1. Architecture diagrams
2. Technical diagrams
3. Technical presentations / native PPTX
4. Creative presentations
5. Ads and reusable creative assets

A built-in Prompt Studio converts weak user intent into a versioned, inspectable `PromptSpec` before generation. The platform is not a collection of donor clones. Donors are evidence/capability sources and are normalized through the Reverse Engineering Roadmap + REA provider layer.

## Canonical owned architecture

```text
Agent Work OS
  └─ Visual Intelligence Platform
      ├─ Prompt Studio
      │   ├─ intent router
      │   ├─ prompt compiler
      │   ├─ constraint elicitor
      │   └─ reusable prompt library
      ├─ Agent Orchestrator
      │   ├─ planner
      │   ├─ researcher / grounding agent
      │   ├─ architecture critic
      │   ├─ narrative agent
      │   ├─ design/layout agent
      │   ├─ renderer/compiler agent
      │   └─ QA / fresh-eyes reviewer
      ├─ Diagram OS
      │   ├─ RE-356 Traceframe
      │   ├─ DiagramSpec
      │   ├─ technical-visual-studio workspace
      │   └─ Mermaid / PlantUML / Draw.io / C4 adapters
      ├─ Presentation OS
      │   ├─ DeckPlan / SlidePlan
      │   ├─ native editable PPTX compiler
      │   ├─ brand/theme engine
      │   └─ diagram -> native-slide bridge
      ├─ Creative Studio
      │   ├─ editable canvas
      │   ├─ ads / social / carousel / one-pager
      │   └─ image/video provider adapters
      ├─ Shared Visual Core
      │   ├─ evidence/provenance graph
      │   ├─ semantic object model
      │   ├─ layout engine
      │   ├─ accessibility
      │   ├─ brand policy
      │   ├─ render receipts
      │   └─ artifact diff/version history
      └─ Interfaces
          ├─ hosted web app
          ├─ API + SDK
          ├─ MCP server
          └─ skills/plugins: Codex, Claude, Cursor, Antigravity, Gemini, others
```

## Edition model

### Community
- Prompt Studio
- bounded monthly generations/credits
- public/community templates and prompt packs
- architecture + technical diagrams
- lightweight presentations and creatives
- PNG/SVG/PDF export
- public/community gallery and fork/remix
- community support

### Pro
- everything in Community
- private projects
- native editable PPTX
- brand kits
- advanced architecture review and multi-agent QA
- larger files/decks and higher generation limits
- version history
- Draw.io/Mermaid/PlantUML import/export
- API/MCP with bounded concurrency
- premium prompt packs and template library

### Enterprise
- everything in Pro
- organizations, workspaces and RBAC
- SSO/SAML/SCIM
- audit logs and retention controls
- private knowledge/RAG grounding
- private model/provider routing and BYOK
- policy/governance controls
- custom brand systems
- approval workflows
- higher API/MCP quotas
- deployment controls, private/on-prem option where feasible
- dedicated support/SLA

## Donor / comparator consolidation

| Source | Classification | Capability to absorb / benchmark | Canonical destination |
|---|---|---|---|
| PPT Master | donor | native editable PPTX, create/edit/template routes, DrawingML compilation | Presentation OS |
| Slidekick | donor | skill/plugin portability, HTML/CSS geometry -> native PPTX, PowerPoint render verification, fresh-eyes review | Presentation OS + QA |
| Eraser AI | comparator/donor | prompt/code/doc -> diagram, visual + diagram-as-code editing, MCP/API, agent integrations | Diagram OS + Interfaces |
| Cocoon architecture-diagram-generator | donor | portable agent skill, self-contained HTML/SVG, consistent technical visual language | Diagram skills + Technical Visual Studio |
| IcePanel LLM comparison | evaluation evidence | demonstrates single-LLM C4 failures, need for constraints/review/human approval | architecture critic + benchmark suite |
| Yworq Atlas Slides | comparator | guided preferences, deep research, multi-step generation pipeline, AI editing, PPTX/Google Slides export | Prompt Studio + Presentation OS |
| PresentationAIList | market index | competitive discovery / regression watchlist | research corpus |
| SlideBench | benchmark donor | category-scoped artifact + malleability evaluation | VisualBench certification |
| Moda | comparator | editable canvas, slides + social + ads + docs, brand kits, API/MCP, tiering | Creative Studio + pricing |
| Pi / Presentation Intelligence | comparator | multi-agent design engine, AI-native layout, adaptive/fluid content, API/MCP/private deployment | design orchestrator + enterprise |
| Data2Slide | comparator | file/data readiness checks, data-to-story pipeline, warnings, per-slide AI edits | data ingestion + deck planner |
| Julius AI | comparator | research/data/code -> presentations, charts, images, video, team workspace | research/data agents + Creative Studio |
| RE-356 Traceframe | owned subsystem | deterministic DiagramSpec, accessible SVG/HTML, receipts | Diagram OS core |
| technical-visual-studio | owned product shell | browser/API/MCP authoring workspace | hosted Visual Intelligence UI |
| Presentation OS PR #143 | owned subsystem | DeckPlan contracts and presentation shipping gates | Presentation OS core |
| PR Lens | owned extension | code/PR -> explanatory architecture/data-flow | Diagram OS source adapter |
| RE-213 Zalcro | owned upstream producer | requirements -> architecture -> dependency DAG -> implementation plan | planning input to DiagramSpec/DeckPlan |
| Diagram Design / DiaStream / System Atlas / Diago | donors/comparators | diagram grammar, evidence and interaction patterns | Diagram OS research corpus |
| Mermaid / PlantUML / Draw.io | adapters | portable interchange / import-export | Diagram OS adapters |

## Golden fixtures already available

Use existing Dell POV interactive decks, Dell editable architecture/data-product diagrams, BCBSA CCL Snowflake executive/architecture/data-flow decks, Revinate architecture/Lake Formation/UAM decks and Draw.io sources, Snowflake/AWS/AppFlow-Stitch migration decks, migration-testing UML, editable scientific poster reconstruction, and the Agentic AI/data-engineering book figure corpus as non-donor regression fixtures.

## Why multi-agent architecture is required

The architecture-generation evaluation evidence repeatedly shows that a generic LLM call tends to confuse C4 abstraction levels, choose familiar technologies without contextual justification, omit operating constraints, and degrade under iterative requirement changes. Therefore generation must be decomposed into governed stages:

`intent -> requirements/constraints -> evidence -> architecture plan -> critic -> semantic spec -> layout -> render -> mechanical QA -> fresh-eyes review -> artifact receipt`.

No single model output is treated as production architecture truth.

## Prompt Studio contract

A PromptSpec MUST include:

- artifact type
- objective
- audience
- source inputs and evidence policy
- required content/components
- constraints (technology, security, cost, compliance, style, length)
- output/editability requirements
- brand/theme instructions
- reviewer policy
- export targets

Prompt Studio can produce a polished prompt for a human to reuse, or hand the structured PromptSpec directly to the agent orchestrator.

## Reverse Engineering / clean-room rule

For every donor: SOURCE -> EVIDENCE -> RECONSTRUCTION -> INTERNAL DEDUPE -> MATCH/IMPROVE/NEW/OMIT -> OWNED SPEC -> SHIPPING CONTRACT -> IMPLEMENTATION -> VERIFICATION -> DEPLOYMENT RECEIPT.

Do not copy proprietary prompts, branding, private implementation, assets or page composition. Open-source code reuse is license-gated and recorded separately from clean-room reconstruction.

## Phase A implementation slice

1. Hosted visual product shell.
2. Five artifact-type routes.
3. Deterministic Prompt Studio / PromptSpec compiler.
4. Agent-chain preview showing which specialist agents will run.
5. Community / Pro / Enterprise feature matrix.
6. No external model credentials required.
7. Preview deployment only; no production/shipped claim.

## Phase B

- bind Traceframe / DiagramSpec
- implement architecture critic
- file/code/document ingestion
- source/evidence receipts
- editable diagram workspace
- SVG/PNG/PDF exports
- Mermaid/PlantUML/Draw.io bridges

## Phase C

- merge Presentation OS compiler work
- native editable PPTX
- charts/tables with data lineage
- brand kits / themes
- diagrams embedded as native editable slide objects
- PowerPoint/LibreOffice render verification
- category-scoped VisualBench tests

## Phase D

- creative canvas for ads/social/carousels/documents
- image/video provider routing
- reusable campaign systems
- responsive/adaptive artboards
- community template/prompt marketplace

## Phase E

- authentication, billing, credits/usage
- organizations, RBAC, audit logs
- API/SDK/MCP
- plugin/skill packaging
- enterprise SSO/private knowledge/model routing
- staged preview -> production certification
