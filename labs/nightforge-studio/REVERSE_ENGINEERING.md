# Reverse-engineering dossier — autonomous browser-game studio

## Source identity

Primary observed source: public Vibe Games Studio website and the linked Reddit showcase posted 2026-10-14.

Publicly observable behaviors used as evidence:

- A roster of named AI agents with distinct roles.
- A scheduled nightly sequence initiated by cron.
- Separate pitch, creator, improver, housekeeping, QA, orchestration and marketing responsibilities.
- The public description says a new game is built end to end with its own container.
- Independent QA is described as gating every lane before shipping.
- The orchestrator updates the portal, devlog and dossiers after the production lanes finish.
- The public catalog contains second-generation games that went through repeated build/play/rebuild iterations.
- The Hellcat Fury game page states that game is built in Three.js.

## REA interpretation

REA is used as a governed **evidence and capability-discovery provider**. It is not allowed to define truth, approve policy exceptions, copy proprietary artifacts, or ship directly.

Canonical flow for this reconstruction:

```text
Source identity
  -> public evidence capture
  -> capability hypotheses
  -> donor / provider boundary
  -> clean-room product contract
  -> implementation
  -> independent verification
  -> replay / receipts
  -> Shipping OS gate
  -> deployment
```

## Capability decomposition

| Capability | Observed pattern | NightForge implementation |
|---|---|---|
| Scheduled autonomy | role-specific nightly times | explicit ordered shift state machine |
| Creative research | trend-to-pitch | bounded theme input -> mechanic-first pitch |
| Game creation | fresh browser game | deterministic playable Canvas artifact |
| Iteration | many passes on same game | three improvement passes per build |
| Housekeeping | bugs/refactors/tests | structural input/state checks |
| Independent QA | separate QA agent | scored acceptance contract; no self-approval |
| Release orchestration | rebuild portal/devlog | receipt chain + catalog publication |
| Public catalog | click-and-play games | persistent playable game cards |
| Provenance | logged history | per-stage receipt hashes |

## Clean-room boundary

NightForge does not copy:

- source code or bundles from the reference;
- agent prompts or hidden configuration;
- artwork, audio, 3D models, logos, screenshots, names, story text, or game content;
- deployment credentials or private infrastructure;
- proprietary datasets.

All UI, naming, code, mechanics, generated titles and visual assets in NightForge are independently authored for this reconstruction.

## Verification gates

v0.1 acceptance:

- static app loads with no external dependency;
- shift can run from research through publication;
- each lane emits a receipt;
- QA threshold is explicit and downstream publication only occurs after QA;
- published game is playable with keyboard + pointer/touch;
- generated artifacts persist locally;
- game reset and dialog close paths work;
- Vercel returns 2xx for root assets.

v0.2 acceptance adds container isolation, generated-source static analysis, headless browser gameplay tests, screenshot/video evidence, deterministic replay metadata, provider budgets, and exact-SHA deployment receipts.
