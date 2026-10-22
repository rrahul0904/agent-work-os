# REA: Seven-app 80/20 portfolio (2026-10-22)

## Primary evidence
Reddit: https://www.reddit.com/r/AppBuilding/comments/1xc9b58/7_apps_and_counting_using_the_8020_rule_how_do/

The author identifies seven products and says they share about 80% functional specifications and behavior. A comment explicitly clarifies that the 80% is not necessarily identical source code. No private implementations, analytics, conversion data, revenue or licensed algorithms have been inspected.

Public sites:
- Reveal the Dream: https://revealthedream.com/ — photo-reveal habits
- Prompt Petal: https://promptpetal.com/ — prompt/snippet management, clipboard, workflows, AI tools
- Keep the Diff: https://keepthediff.com/ — planned versus actual spending
- Still Dock: https://stilldock.com/ — Dock settings and keyboard shortcut guards
- Little Bird Trading: https://littlebirdtrading.com/ — timed market levels
- MyLinedChart: https://mylinedchart.com/ — chart annotations and structured exports
- The Long View: https://thelongviewapp.com/ — smoking-cessation progress and estimates

## Routing
DONOR_REFERENCE -> Agent Work OS app-factory module, with independently approved app repositories later. Existing vertical-site-factory is a dental website factory and not the owner for this cross-platform application research.

## Shared fabric
Ten contracts: local-first privacy, accessible design system, portable exports, settings, schema migrations, opt-in telemetry, entitlements, recovery/sync, smoke tests, and release evidence. Do not interpret 80/20 as proven code-reuse arithmetic. Maintain per-app versions, feature parity tests and independent domain schemas.

## Product workstreams and constraints
1. Prompt Petal: local prompt library and controlled export/insertion. Clipboard privacy, explicit OS permissions and secret redaction required.
2. Reveal the Dream: journeys, check-in ledger and deterministic photo reveal. Photo and notification consent required.
3. Keep the Diff: offline spending decisions and aggregation. Private financial records, no fake banking data.
4. The Long View: milestone tracking with sourced illustrative estimates; clinical review, no claims of individual longevity.
5. Still Dock: signed reversible native Mac utility. Accessibility permissions and macOS system safety review.
6. MyLinedChart: chart zones and portable annotations first; read-only broker adapters and market-data terms reviewed before expansion.
7. Little Bird Trading: licensed feeds, deterministic level calculation, session provenance, replay and educational finance disclosures.

Each workstream: observe -> specify -> original implementation -> test -> domain/security review -> authorization -> staged release. Test main user action, prior user-data compatibility, import/export, purchase restore, offline conflicts, permission denial, accessibility, exact-SHA CI and rollback.

## Current deliverable
packages/app-factory/catalog.mjs: independent public-evidence catalog
packages/app-factory/planner.mjs: deterministic capability DAG and fail-closed release gate
packages/app-factory/cli.mjs: prints plan, checks catalog, reports missing evidence
packages/app-factory/test/portfolio.test.mjs: six Node tests
.github/workflows/app-factory-research.yml: isolated CI verification

Status is RESEARCH / PHASE 0. None of the seven apps are implemented or deployed. No main branch merge, live provider write, store submission or production deployment is authorized by this dossier. All original brand and private assets remain outside the clean-room boundary.
