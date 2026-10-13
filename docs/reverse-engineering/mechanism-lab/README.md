# Mechanism Lab — governed REA dossier

Status: `IMPLEMENTED_CORE / PREVIEW_DEPLOY_PENDING / CERTIFICATION_PENDING`

## Target identity

Reference target: Anima (`Garinmckayl/anima`, MIT), surfaced from the Reddit SideProject post "I built Anima - turn any biology idea into an interactive scientific visualization" on 2026-10-13.

Our product identity: **Mechanism Lab**. This is an independent clean-room reconstruction focused on observable product capabilities, not donor branding, layout, assets, prompts, or implementation.

## Canonical roadmap

Target/Source → Discovery → REA Investigation → Evidence → Understanding → Reconstruction → Specification → Improvement → Build → Verify → Compare → Deploy → Certify.

REA is the governed reverse-engineering provider/capability layer. Agent Work OS remains the authority for provenance, clean-room boundaries, implementation, verification, replay, deployment, and shipping certification.

## Evidence classification

- **Observed** — the reference produces standalone interactive biology pages, keeps per-figure sources, exposes uncertainty/simplification, includes interactive mechanistic controls, supports dark/light presentation, and is currently centered on Claude Code.
- **Observed** — Reddit feedback highlights scientific accuracy as a primary risk, values clickable per-page sources, asks whether outputs persist, and asks for Gemini/ChatGPT support.
- **Inferred** — a model-agnostic provider boundary is a meaningful product improvement because the rendering/artifact model does not intrinsically require a single LLM vendor.
- **Verified in our build** — Mechanism Lab runs as a deterministic browser artifact with three curated mechanisms, interactive controls, an evidence ledger, confidence labels, explicit simplification notes, provider-adapter UI, reduced-motion handling, theme control, and standalone HTML export.

## Capability matrix

| Capability | Decision | Notes |
|---|---|---|
| Interactive mechanistic visualization | MATCH | Independent SVG implementation |
| Source-first evidence panel | MATCH | Claims link to public scientific references |
| Confidence / uncertainty disclosure | IMPROVE | Per-claim confidence plus scene-level simplifications |
| Standalone reusable artifact | MATCH | Export button serializes the active figure and evidence into HTML |
| Claude-only execution | OMIT | Avoid single-vendor coupling |
| OpenAI / Gemini / Claude adapter boundary | NEW | Public demo exposes provider-ready architecture without private keys |
| Medical advice | OMIT | Educational mechanism-only boundary |
| Automatic scientific truth guarantee | OMIT | Product explicitly avoids claiming autonomous scientific correctness |

## Clean-room boundary

Do not copy donor source code, visual identity, logo, page composition, skill instructions, example assets, screenshots, or exact wording. Preserve only independently documented product behavior and scientifically sourced domain facts. All implementation under `apps/web/public/mechanism-lab/` is independently authored for this project.

## Scientific evidence used in the current demo

The DAT scene uses review literature describing DAT-mediated dopamine clearance, cocaine-mediated uptake blockade, amphetamine substrate/reverse-transport models, and acknowledged DAT-independent effects. The D1/D2 scene uses the IUPHAR dopamine-receptor review for canonical Gs/olf versus Gi/o coupling and cAMP signaling. The GLP-1 scene is intentionally conceptual and includes an educational-use boundary rather than clinical guidance.

## Current implementation slice

`apps/web/public/mechanism-lab/index.html`

Functional behaviors:

1. Free-text prompt maps deterministically to one of three curated mechanisms.
2. OpenAI, Gemini, and Claude are represented as provider adapters; the public build does not call private model APIs.
3. Each mechanism has state controls that alter the biological drawing and live model readout.
4. Each evidence claim has a confidence label and a source link.
5. Simplifications and uncertainties remain visible next to the figure.
6. Users can pause motion and respect reduced-motion preferences.
7. Users can export the active visualization as a standalone HTML artifact with its evidence ledger.

## Verification contract

Required before certification:

- source branch is isolated from `main`;
- deployed artifact is reachable over HTTPS;
- route returns HTTP 200;
- DAT, receptor, and GLP-1 scene switching works;
- mechanism mode toggles alter the rendered state;
- evidence links are visible;
- exported HTML is generated client-side;
- no API key or secret is embedded;
- hosted build corresponds to the branch SHA;
- browser UAT and production-promotion remain separate gates.

## Improvement backlog

P0: provider-backed generation contract with structured schema (`claims`, `sources`, `uncertainty`, `mechanism_graph`, `interactions`) and a scientific-evidence validation gate.

P0: citation resolver that rejects unsupported numerical claims and records species/tissue/experimental conditions.

P1: expert-review workflow with signed approval receipt for classroom/publication use.

P1: editable graph canvas, share links, saved projects, and version history.

P1: optional WebGL scene renderer while retaining accessible SVG fallback.

P2: domain packs for molecular biology, anatomy, pharmacology, physiology, and cell signaling.

## Shipping posture

The current slice is suitable for a public preview as an educational, deterministic prototype. It is not yet certified as an autonomous scientific-authoring system; expert review and evidence-validation gates remain mandatory before any publication-grade claim.