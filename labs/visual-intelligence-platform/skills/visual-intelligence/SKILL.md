# Visual Intelligence Skill

Use this skill when a user asks to create, improve, explain, review or export an architecture diagram, technical diagram, technical presentation, creative presentation or creative ad.

## Workflow

1. Compile the request into `prompt-spec/v1alpha1` using Prompt Studio.
2. Preserve source provenance and distinguish observed facts, inference and recommendations.
3. Select the artifact-specific specialist agent chain.
4. Produce the semantic artifact plan before rendering.
5. Run domain critique before write/render stages.
6. Require mechanical QA, a fresh-eyes review and a render receipt before claiming readiness.
7. Respect edition entitlements. Never bypass Community/Pro/Enterprise capability gates.

## Canonical outputs

- architecture/technical diagram -> DiagramSpec / Traceframe-compatible semantic artifact
- technical/creative presentation -> DeckPlan / Presentation OS-compatible artifact
- creative ad -> layered CreativeSpec-compatible artifact

## Interfaces

The same governed capability is intended to be exposed through the hosted web application, API, MCP and thin agent adapters for Codex, Claude, Cursor, Antigravity, Gemini and compatible hosts.

## Boundaries

Do not copy donor branding, proprietary prompts or private implementations. Do not invent evidence. Do not claim a native editable PPTX when the output is flattened. Do not claim deployment, production readiness or artifact quality without the corresponding receipts.
