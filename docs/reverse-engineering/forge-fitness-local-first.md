# Forge Fitness — clean-room reverse-engineering dossier

Tracker: #98  
Source snapshot: 2026-10-10  
Upstream repository: `Shriyans737/Forge-Fitness`  
Inspected upstream head: `02e4e0cb81120f40140316d1e190abf495b6e48a`

## Status

`RESEARCH / STANDALONE_PRODUCT_CANDIDATE / PRODUCT-CODE PLACEMENT NOT YET APPROVED`

This document records behavioral evidence and an independently designed product/engineering response. It does not claim Forge parity, source-code access, deployment, or production readiness.

## 1. Source truth

The supplied Reddit post points to Forge Fitness, described as an offline-first Flutter workout tracker with no account/cloud requirement for core logging, an 800+ exercise library, muscle targeting and local Hive storage.

The public GitHub repository does **not** expose the application source tree at the inspected head. Its root contains only `README.md` and `LICENSE`, and the visible recent history consists of README/license edits. The README describes the intended/application behavior in detail, but the Flutter source, assets, tests, platform projects and build files are not public in this repository snapshot.

**Classification:** Forge is a behavioral/design donor. It is not a code donor for this effort.

### Rights boundary

- Published Forge repository material is MIT licensed.
- No unpublished/private Forge implementation may be inferred, copied or represented as available.
- Forge branding, screenshots, marketing copy and visual trade dress are not implementation inputs.
- Forge names `yuhonas/free-exercise-db` as its exercise dataset. That upstream repository identifies the data as public domain / Unlicense and should be evaluated independently, with source provenance retained.
- Open Food Facts, Apple Health/HealthKit, Health Connect, YouTube, Gemini and other providers remain separate integrations subject to their own current policies/terms.

## 2. Observed/documented product model

### Workouts

The README describes:

- 870+ searchable/filterable exercises;
- exercise details with instructions, start/end images and optional YouTube tutorial;
- primary/secondary muscle mapping;
- named workout templates with planned sets/reps;
- an explicit template detail screen before starting;
- an active workout that continuously auto-saves;
- exercise additions while a workout is active;
- a live timer, muscle visualizer, volume and rep totals;
- workout summary/history/share-card flows;
- an AI workout maker.

### Health

The README describes read-only Apple Health / Health Connect ingestion for activity, sleep, vitals, body stats and watch workouts, plus body measurements/trends and a manually refreshable overview.

### Nutrition

The README describes calorie/macro goals, manual food entry, Open Food Facts search, barcode scanning, and optional Gemini multimodal food-photo recognition. AI results are editable before save and the Gemini key is described as bring-your-own-key stored in secure device storage.

### Dashboard and visual system

The README describes a personalized dashboard, today's progress, swipe-to-start workout, muscles worked, weekly overview, sleep/strain/recovery-style rings, light/dark modes, custom charts/gauges and a floating bottom navigation treatment.

### Described implementation

The README names Flutter/Dart, Hive, `flutter_secure_storage`, the Flutter `health` package, Open Food Facts, Gemini, YouTube, `cached_network_image`, `fl_chart`, a body-part selector, `share_plus`, AdMob and Dart isolates. Exercise seeding is described as a one-time background-isolate job. Active workout state is described as continuously persisted.

These are **README claims**, not verified source-level implementation evidence.

## 3. Missing evidence / unknowns

The following remain `UNKNOWN` until independently observed or verified:

- actual application source structure and code quality;
- actual persistence schema and transaction/recovery semantics;
- whether auto-save survives partial writes, abrupt kill and schema migration;
- exact HealthKit/Health Connect scopes and deduplication behavior;
- actual Gemini prompt/schema/error behavior;
- barcode implementation;
- production crash/ANR characteristics;
- exercise-image cache behavior under offline/eviction conditions;
- low/mid-tier Android performance;
- shipping App Store / Play Store status and retention;
- whether README screenshots exactly match a currently shipping build.

Unknowns must not be filled from architectural preference.

## 4. User job and reconstructed core loop

Primary job hypothesis:

> Log training quickly and reliably in the gym, keep ownership of the data, and understand progress without needing an account, subscription or network connection.

Core workout loop:

`launch/resume → choose workout → log set → rest → repeat → finish → summary/history → progress projection`

Secondary loops:

- `exercise search → detail/muscle/instructions → add to template/session`
- `health permission → bounded import → provenance-aware health summary`
- `food search/barcode/manual/photo draft → user review → nutrition log`
- `local history → deterministic metrics → explainable suggestion`

The active-workout loop is the critical path. Dashboard decoration, AI, health aggregation and nutrition breadth must never make that loop slower or less reliable.

## 5. Adjacent-market findings

Current adjacent products demonstrate that `offline + workouts + macros + AI photo` is no longer a unique feature bundle. Recent products expose combinations of offline workout logging, templates, local SQLite-style persistence, muscle heatmaps, e1RM/history, Health integration, nutrition tracking, CSV export and optional/on-device AI.

Community discussion also surfaces recurring category pressure:

- subscription fatigue around basic workout logging;
- users falling back to notes/spreadsheets when core set logging is paywalled;
- concern that all-in-one workout + nutrition apps can become mediocre at both jobs;
- dashboard overload when too much health/nutrition/training information is presented at once;
- workout timer/session crashes are high-severity failures because they occur during the primary use moment;
- privacy, exportability and fast offline logging are repeatedly valued.

These are adjacent-market signals, not Forge-specific user feedback. The original supplied Forge thread did not expose a substantive comment corpus at intake.

## 6. Clean-room product thesis

Build a **privacy-first personal training ledger**, not a Forge clone.

Core promise:

> Workout logging, history, body metrics and deterministic progress analysis remain fast and fully usable without an account, subscription or network. Optional intelligence and external integrations are explicit, reversible and provenance-aware.

### Differentiation

1. **Crash-safe session ledger** — every accepted set transition has deterministic persistence/recovery semantics.
2. **Zero-friction gym UX** — previous values, quick duplicate/set edits, load helpers, haptics and one-hand interaction with measurable tap/time budgets.
3. **Local analytics first** — volume, frequency, PRs and e1RM are deterministic local projections rather than LLM guesses.
4. **Explainable suggestions** — recommendation inputs, rule/formula version and evidence are inspectable.
5. **Data ownership** — versioned JSON/CSV export, backup/restore integrity and erase semantics from the beginning.
6. **Optional cloud only** — later sync replicates an on-device source of truth; it never becomes mandatory for the core loop.
7. **Privacy separation** — workout, Health, food and AI scopes are explicit; no ad SDK in the privacy-first core.
8. **Progressive disclosure** — the home surface prioritizes the next training action; health/nutrition depth opens on demand.
9. **Provider-neutral optional AI** — BYOK/provider boundary, editable drafts and request provenance.
10. **Wellness scope** — no diagnosis/treatment posture.

## 7. Capability decisions

### MATCH

- local-first mobile app;
- exercise library + filters;
- templates and active workout;
- auto-save/recovery intent;
- history and share artifacts;
- body measurements;
- read-only Health integration;
- nutrition goals/logging;
- Open Food Facts/barcode/manual food;
- optional photo recognition;
- themes and progress visualization.

### IMPROVE

- use a relational local model (candidate: SQLite/Drift) for analytics-heavy state;
- use versioned/idempotent exercise seeding and migrations;
- persist workout transitions transactionally with explicit recovery semantics;
- bundle essential exercise media or use a provenance-aware offline cache instead of silently relying on GitHub raw URLs;
- make analytics/overload formulas deterministic and versioned;
- ship export/backup/restore before cloud sync;
- request Health permissions by scope and retain source/timestamp provenance;
- keep the dashboard progressively disclosed;
- exclude ad SDKs from the initial privacy-first build;
- set measurable launch/search/save performance budgets.

### NEW

- `workout-ledger/v1`;
- `ExerciseCatalogVersion` + migration receipt;
- `ActiveWorkoutRecoveryReceipt`;
- `TrainingMetricReceipt`;
- `SuggestionEvidence`;
- `HealthImportReceipt`;
- `NutritionLookupReceipt`;
- privacy-preserving `AIRequestReceipt`;
- backup/restore integrity manifest;
- provenance-aware media cache;
- one-hand/tap-budget acceptance tests.

### OMIT / DEFER

- Forge branding/assets/UI trade dress;
- AdMob in the initial product;
- mandatory accounts;
- cloud source of truth;
- social feed/community;
- medical diagnosis/treatment recommendations;
- Garmin until core health ingestion is proven;
- watch companion until phone workflow is stable;
- AI-generated plan mutations that bypass deterministic validation.

## 8. Candidate owned domain model

- `ExerciseDefinition`
- `ExerciseCatalogVersion`
- `WorkoutTemplate`
- `TemplateExercise`
- `WorkoutSession`
- `WorkoutExercise`
- `WorkoutSet`
- `SessionEvent`
- `PersonalRecord`
- `TrainingMetric`
- `TrainingSuggestion`
- `BodyMeasurement`
- `HealthObservation`
- `HealthImportCursor`
- `NutritionGoal`
- `FoodDefinition`
- `FoodLogEntry`
- `Meal`
- `ProviderLookupReceipt`
- `AIRecognitionDraft`
- `UserPreference`
- `BackupManifest`
- `RestoreReceipt`
- `ShareCardSnapshot`

Rules:

- local DB is canonical for core product facts;
- provider responses enter as provenance-bearing data/drafts, never invisible truth;
- persistence acknowledgment and session completion are separate facts;
- process disappearance never implies completion;
- Health imports are idempotent/source-aware;
- suggestions never rewrite history;
- backup/export schemas are versioned and round-trip tested.

## 9. `workout-ledger/v1` behavioral contract

The first implementation slice is intentionally offline and side-effect bounded.

### Required invariants

- stable versioned identifiers for session/exercise/set/event;
- an idempotency key can be accepted at most once per session;
- replay cannot silently mutate an accepted set;
- event sequence is monotonic per session;
- the same accepted event log reconstructs the same session digest;
- active-session recovery reconstructs the latest accepted state;
- `completed` is explicit and terminal for that session identity;
- app/process disappearance cannot imply `completed`;
- editing/deleting the current draft cannot alter prior completed historical sessions;
- metrics are versioned projections over persisted facts, not mutable source facts.

### Required negative/recovery tests

1. duplicate set-submit retry persists once;
2. process kill after persistence acknowledgment recovers the accepted set;
3. process kill before persistence acknowledgment does not fabricate the set;
4. out-of-order/stale replay is rejected or handled deterministically;
5. finishing the same session twice is idempotent;
6. restart after finish preserves terminal state;
7. malformed/corrupt event fails closed without deleting prior valid history;
8. same metric inputs + formula version produce the same result;
9. export/import round-trip preserves identifiers and session digest;
10. no network is required for the entire slice.

## 10. UX acceptance contract

Critical path:

`launch → resume/start workout → log set → rest → next set → finish → summary`

Candidate measurable targets to validate during implementation:

- active-workout screen remains usable in airplane mode;
- local exercise search does not need network;
- accepted set visibly reaches persisted state immediately;
- forced restart resumes an unfinished accepted session;
- prior set/history is available inside the logging flow;
- an unfinished session can resume without passing through dashboard decoration;
- common set logging is reachable one-handed across supported phone sizes;
- animations/modals do not block timing-critical input.

## 11. Privacy/safety contract

- Health access is requested just-in-time by type/scope.
- Initial health integration is read-only.
- provider keys live only in platform secure storage and never in DB/export/logs.
- before optional AI transmission, UI makes the provider/data boundary explicit.
- AI/provider outage or missing key cannot break manual workout/nutrition logging.
- raw workout/food/health content is excluded from analytics/crash telemetry by default.
- initial core has no ad SDK.
- export and erase behavior is testable.
- fitness suggestions remain general wellness/training guidance, not medical diagnosis/treatment.

## 12. Delivery phases

### P0 — Evidence / placement

- resolve source and exact upstream head — done;
- inspect root/source availability — done;
- license boundary — done;
- duplicate/owned-product audit — done;
- initial comparator/community scan — done;
- preserve first-party UI evidence where available — pending;
- monitor source-thread creator/comment feedback — pending;
- verify any shipping store/pricing surface if discovered — pending;
- record placement terminal — pending.

P0 terminal: `STANDALONE_PRODUCT_APPROVED | SHARED_HEALTH_CAPABILITY | NO_INCREMENTAL_VALUE`.

### P1 — Contract/spec

Freeze workout ledger, catalog/migration, active-session recovery, history/metric, backup/export and one-hand UX acceptance contracts.

### P2 — Offline workout vertical slice

Flutter shell; SQLite/Drift; seeded exercise search; templates; workout start; sets/reps/weight; rest timer; crash recovery; finish; history; deterministic PR/e1RM/volume; JSON/CSV export.

### P3 — Muscle/progress intelligence

Independent muscle map, per-exercise charts, weekly frequency/volume, rule-based progressive overload, explainable suggestion receipts.

### P4 — Health/body

HealthKit + Health Connect read integration, scoped permissions, idempotent imports, body log/trends and source/timestamp provenance.

### P5 — Nutrition

Goals, manual food, Open Food Facts, barcode, daily log/totals, provider provenance and offline cache/error behavior.

### P6 — Optional AI

BYOK provider abstraction, secure key references, editable photo-food draft, bounded workout-plan draft, deterministic plan validation and AI request receipts.

### P7 — Backup/share/polish

Encrypted backup/integrity/restore, share cards, themes, progressive dashboard, accessibility, haptics and low-memory/background recovery.

### P8 — Device/release certification

Exact-head analysis/tests; simulator/emulator checks; physical Health device UAT; airplane-mode workout; force-kill recovery; backup corruption test; provider outage tests; signed test builds; TestFlight/Play internal testing if authorized; privacy/data-safety reconciliation; explicit owner gate before public release.

## 13. Verification ladder

`Static → Unit → Integration → Contract → Runtime → Persistence/Recovery → Device UAT → Signed Build → Test Distribution → Production`

Tracker state advances only from evidence. Never infer `PARITY`, `DEPLOYED`, `PRODUCTION_READY`, `COMPLETE` or `SHIPPED` from a spec, generated code, a process exit, or a UI screenshot.

## 14. Placement decision recommendation

Current evidence supports **standalone-product candidacy**, because no direct owned consumer fitness tracker was found in the connected repository/tracker audit and the product job is distinct from the existing gym check-in workflow.

However, implementation code should wait for the placement terminal. Until then, work in Agent Work OS is limited to research/spec/evidence coordination so the portfolio does not silently acquire another duplicate product lane.

## 15. Next executable slice after placement approval

Create a dedicated owned mobile repository and implement only `workout-ledger/v1` plus its deterministic recovery/export tests before UI breadth. The first proof is not a dashboard. It is:

`offline start → set accepted → process kill → deterministic recovery → finish → history → deterministic metrics → export/import digest match`

Only after that receipt is green should the product add muscle visualizations, Health, nutrition or AI.
