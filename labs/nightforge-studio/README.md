# NightForge — Autonomous Game Studio

NightForge is a clean-room product slice inside Agent Work OS. It reconstructs the **capability pattern** of an autonomous browser-game studio without copying source code, assets, names, prompts, branding, or private implementation details from the observed reference.

## What is implemented in v0.1

- Eight-role autonomous shift pipeline: signal research, mechanic-first pitch, build, multi-pass iteration, housekeeping, independent QA, release gate, publication.
- Deterministic procedural game artifact generator.
- Real playable Canvas game output with keyboard, pointer, and touch controls.
- Persistent local catalog using `localStorage`.
- QA dossier with independent scores for mechanic, controls, stability, and mobile input.
- Per-stage evidence receipts with deterministic hashes.
- Responsive studio storefront / control console.
- Vercel-ready static deployment with security headers.

## Architecture

```text
Source / inspiration evidence
          |
          v
REA provider boundary ---> capability hypotheses
          |                         |
          +-------------------------+
                                    v
                      Agent Work OS authority
                      | policy / provenance
                      | work-item state
                      | QA + Shipping OS gates
                                    |
        +---------------------------+---------------------------+
        |                           |                           |
    Trend Scout                Game Builder                 QA Inspector
        |                           |                           |
        +------> mechanic pitch --->+--> iteration gauntlet --->+
                                                                |
                                                        release evidence
                                                                |
                                                        catalog publisher
                                                                |
                                                        playable browser game
```

## Local run

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

No external runtime dependencies are required for v0.1.

## Production roadmap

v0.1 deliberately uses a deterministic clean-room builder so the complete pipeline can be deployed and verified without provider credentials. Production autonomy adds two gated capabilities:

1. **LLM provider adapter** — generates/edits game source from constrained contracts.
2. **Sandboxed build worker** — runs generated code in an isolated container, executes browser QA, captures screenshots/video/telemetry, and only then hands an immutable artifact to Shipping OS.

The provider and worker do **not** become authorities. They produce candidate artifacts and evidence. Agent Work OS owns authorization and release decisions.
