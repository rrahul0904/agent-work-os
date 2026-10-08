# SRC-0333 — Portal17 Studio donor → Local Automation Studio

Evidence date: 2026-10-07

Owned coordination issue: #57

## 1. Source identification

Primary source supplied by the user:

- Reddit: https://www.reddit.com/r/SideProject/comments/1x05qqk/i_spent_the_last_months_building_a_nocode/

First-party public evidence:

- Product: https://portal17studio.com/
- Sandbox: https://portal17studio.com/sandbox
- Privacy: https://portal17studio.com/privacy
- Microsoft Store listing: https://apps.microsoft.com/detail/9mx9pn25fsgb

Comparator evidence:

- Microsoft Power Automate desktop/UI automation documentation
- UiPath selector/recorder documentation

No private Portal17 service, binaries, source, hidden API traffic, proprietary assets, prompts or schemas were inspected.

## 2. Evidence collection

### Observed / first-party public

Portal17 presents a Windows 10/11 no-code automation studio with one flow that can include browser and desktop actions. Its first-party surface advertises a visual canvas, smart recorder, branching/loops, desktop launch/wait/click/keys, browser automation, Excel/CSV, API, SQL, email, JavaScript, files, scheduling and local encrypted secrets.

The privacy page states that browser automation uses Microsoft Playwright, `.portal` files are stored where the user chooses, data/variables stay local, no telemetry SDKs are used, and schedules are registered through Windows Task Scheduler.

The public sandbox provides a useful external behavior suite covering login, forms, shop/cart behavior, sortable tables, tabs, modal dialogs, multi-step forms, iframes, drag/drop, explicit waits, new windows/tabs, pagination, hover menus and unstable selectors.

### Author-reported / community signal

The Reddit author describes a desktop control picker that frames the hovered control and selects it with Ctrl, with OCR fallback when controls are not exposed. The material commenter concern visible in the public snapshot is desktop brittleness when application UI changes after recording.

That feedback is treated as a product requirement, not as independent proof that Portal17 either succeeds or fails under those changes.

## 3. Workflow reconstruction

The reconstructed user loop is:

1. Create/open a local flow.
2. Add actions manually or record browser/desktop interactions.
3. Capture target locators/selectors for UI actions.
4. Connect steps on a visual canvas.
5. Add variables, data rows, waits, decisions and repeated work.
6. Reference secrets without embedding plaintext into ordinary step configuration.
7. Run locally and inspect failures.
8. Optionally schedule or launch from a CLI/headless path.
9. Repair brittle targets when applications/web pages change.

The critical architecture insight is that the visual editor and recorder should not be the execution source of truth. They should compile into a versioned flow representation consumed by a local runner.

## 4. Capability and failure-mode decomposition

| Capability | Public signal | Failure mode to design for |
| --- | --- | --- |
| Browser automation | recorder, navigate/click/type/select | volatile selectors, navigation race, popup/tab confusion |
| Desktop automation | control picker, launch/wait/click/keys | UI tree changes, duplicate labels, app version changes, focus drift |
| OCR/image fallback | author + first-party feature descriptions | false positives, resolution/scaling/theme changes, ambiguity |
| Visual graph | canvas, conditions, loops/subflows | invalid graph, hidden cycles, irreproducible editor state |
| Data iteration | Excel/CSV rows and write-back | partial updates, type coercion, duplicate processing |
| Integrations | REST, SQL, email, JS/files | secrets leakage, side effects, retries, idempotency |
| Scheduling | CLI + Windows Task Scheduler | reboot/session state, missed runs, duplicate runs |
| Local data | local-first + encrypted secret references | secret embedding in flow, unsafe exports/backups |

## 5. Feedback translated into requirements

The desktop-brittleness question becomes these explicit requirements:

- prefer semantic selectors (automation/accessibility identity, role+name) over image/OCR;
- retain an ordered selector candidate set instead of one opaque locator;
- record which candidate resolved the target in the execution receipt;
- fail closed when the best eligible selector is ambiguous;
- allow a lower-confidence family such as OCR/image only when its configured confidence threshold is met;
- never claim self-healing when the engine actually guessed;
- preserve failure evidence so the editor can offer a repair workflow later.

## 6. Competitive comparison and dedupe

### Microsoft Power Automate Desktop

Microsoft already supports desktop UI elements, web automation, recorder workflows, UIA/MSAA capture, image-based automation and OCR fallback. Its documentation also makes clear that recorded automation often requires editing and that desktop/web UI elements have distinct semantics.

### UiPath

UiPath has mature selector and anchor concepts plus image automation. Its selector guidance documents volatile-selector problems and treats image automation as a more fragile fallback.

### Portfolio dedupe

This source does not cleanly map into:

- AgentDock: local coding-agent/project/process/worktree control plane;
- SessionGrid: browser/Android session and device control plane;
- Agent Work OS: coding-agent runtime/operator control plane.

A generic end-user browser+desktop RPA studio is a distinct product candidate. Agent Work OS is used only as an evidence-first incubation repository for the bounded Phase A contracts.

## 7. Internal donor audit

Reusable owned patterns:

- Agent Work OS receipt/evidence discipline;
- explicit capability boundaries and fail-closed behavior;
- restart reconciliation that does not fabricate success;
- deterministic contract tests;
- existing browser/runtime research from other portfolio products as later implementation references.

Do not create a second task/approval/memory authority merely to support this product. The Local Automation Studio flow/run model is its own domain runtime, while portfolio governance and engineering evidence stay outside it.

## 8. Product thesis and target boundary

Working canonical: **Local Automation Studio** (`PRD-0177` candidate).

The target is a local-first visual automation product whose durable contract is a portable, versioned flow model spanning browser and desktop capabilities. The differentiator is not a claim of novel RPA primitives. It is a simpler product boundary with stronger truth about target resolution, exact execution receipts, restart behavior and secret handling.

### Match

- one flow across browser + desktop;
- local runner;
- visual editor/recorder later;
- browser/desktop selectors;
- OCR/image fallback;
- data/integration nodes;
- CLI/scheduler.

### Improve

- selector ladder with provenance and ambiguity refusal;
- hash-bound flow and execution receipts;
- explicit interruption state on restart;
- secret references outside ordinary flow values;
- testable external sandbox parity matrix.

### Omit

- Portal17 branding/assets/copy/trade dress;
- proprietary schema/recorder internals;
- stealth, CAPTCHA bypass or anti-bot evasion;
- unverified claims of self-healing, headless desktop reliability or production readiness.

## 9. Behavior contracts and acceptance tests

Phase A implements `local-automation-flow/v1` and `local-automation-receipt/v1`.

Current bounded contract:

- exactly one manual trigger;
- browser and desktop actions may coexist in one flow;
- 200-node / 400-edge bound;
- no arbitrary graph cycles in Phase A (explicit loop semantics are deferred rather than faked);
- selector actions carry ordered selector candidates;
- semantic selectors outrank OCR/image candidates;
- ambiguous selector matches fail as `target_ambiguous`;
- total miss fails as `target_not_found`;
- secret-like config fields accept only `secret://...` references;
- each action receipt binds the exact flow digest, node, capability, selector resolution, outcome digest and previous receipt digest;
- receipt-chain tampering is detectable;
- a persisted running snapshot becomes `interrupted` after restart without live execution proof.

## 10. Phase A implementation

Implemented on branch `reverse/src0333-local-automation-studio`:

- `services/control-api/src/local-automation-studio.js`
- `services/control-api/test/local-automation-studio.test.js`
- this dossier

Adapters are deliberately fake/injected in Phase A. No real browser or Windows desktop side effect is performed by this slice.

## 11. Independent verification gate

Repository CI must run the existing `npm test` and `npm run acceptance` gates at the exact PR head. Local or conversational reasoning is not sufficient evidence.

## 12. Later hosted/browser/recovery certification

Required later, separately:

1. Playwright browser adapter against the 14-case Portal17 public sandbox;
2. selector mutation tests, especially the unstable-selector exercise;
3. Windows UI Automation adapter and control picker;
4. DPI/theme/multi-monitor/app-version target-resolution matrix;
5. OCR/image provider calibration and false-positive testing;
6. real secret vault adapter;
7. Excel/CSV, REST, SQL, email, JS/file adapters;
8. Task Scheduler + CLI restart/reboot behavior;
9. visual editor/recorder UAT;
10. packaging/signing/update/recovery tests on Windows 10/11.

No Portal17 parity or production-readiness claim is allowed until those gates have evidence.

## 13. Tracker consequence

Candidate intake:

- Source: `SRC-0333`
- Product: `PRD-0177` candidate
- Name: Local Automation Studio — Portal17-inspired
- Disposition: NEW CANDIDATE
- Current gate after this branch: exact-head tests/CI, then real browser sandbox adapter

Tracker state must reflect actual exact-head evidence only; research completion does not imply runtime certification.
