# Focus Spoofer → Browser Continuity Guard Research Dossier

**Snapshot:** 2026-10-11  
**Coordination issue:** #144  
**Source:** https://www.reddit.com/r/SideProject/s/9UafxU8O44  
**Product:** https://focus.oddworks.us/  
**Canonical upstream:** https://github.com/Abhinav-ranish/Focus-Spoofer  
**Inspected upstream head:** `080c87268c4775f6db368f224536c34ef7a800ba`  
**Upstream manifest:** `1.8.2`, Manifest V3  
**License:** Apache-2.0  
**Tracker ID:** pending canonical reconciliation

## Executive decision

Focus Spoofer should **not** be cloned under a new name.

The useful donor is a combination of:

1. page visibility/focus continuity mechanics;
2. service-worker/tab/navigation reconciliation patterns;
3. cross-frame injection behavior;
4. privacy-preserving telemetry patterns; and, most importantly,
5. a real product failure caused by **release drift** between a locally fixed build and what users actually received.

The recommended owned product is a standalone candidate tentatively called **Browser Continuity Guard**:

> Keep user-selected media/work pages behaving continuously when a tab is switched or minimized, while minimizing permissions, preserving page compatibility, collecting no browsing history, and certifying the exact store version that users actually install.

Agent Work OS owns evidence, specification, verification and shipping truth until the product-placement gate is resolved. No standalone implementation repository should be created merely to show progress.

## Source / launch evidence

The supplied Reddit launch is unusually useful because it reports a concrete operational failure rather than only marketing claims.

Creator-reported figures in the launch include approximately:

- 98.8k impressions;
- 3.26k listing views;
- 2.23k installs;
- 1.34k uninstalls.

The creator attributes a major uninstall spike to a buggy public v1.6. A v1.7 fix existed locally but was not pushed to users for months. An uninstall-feedback page was added only later.

The durable product lesson is:

> repository success, local extension success and public-store success are different evidence classes.

A fix that does not reach users must remain operationally classified as unfixed.

## Current donor architecture

The inspected upstream source at `080c87268c4775f6db368f224536c34ef7a800ba` exposes a more mature system than the failed public release discussed in the launch.

### Manifest / extension shell

Current manifest facts:

- Manifest V3;
- version `1.8.2`;
- service-worker background runtime;
- `storage`, `scripting`, `activeTab`, `webNavigation` permissions;
- broad host access in current donor (`<all_urls>`);
- popup + options page.

### Runtime registration / reconciliation

Current `background.js` includes:

- top-level uninstall URL registration;
- content scripts registered at `document_start` in `MAIN` world;
- all-frame execution with origin fallback;
- serialized unregister/register operations to prevent duplicate-script races;
- separate session and Always-On registrations;
- invalid Always-On pattern isolation so one bad entry does not break every site;
- per-tab state stored in `chrome.storage.session`;
- a page `sessionStorage` flag used to reconcile extension state after service-worker/update/restart conditions;
- startup hydration of open tabs;
- navigation handling that attempts to keep active protection across origin/frame navigation;
- badge state derived from runtime state rather than only popup state.

### Core page behavior

Current `spoofer.js` includes:

- prototype/instance visibility spoofing;
- focus spoofing;
- selective event suppression;
- logic intended to preserve ordinary element-level focus/blur behavior;
- timing defenses for hidden-tab callback throttling;
- video-frame callback support;
- function `toString()` masking for patched functions;
- optional canvas/WebGL/audio fingerprint randomization.

### Telemetry

Current telemetry implementation is opt-in and aggregate-oriented:

- disabled by default;
- no URL/domain/title in reports;
- no install ID;
- no per-event stream;
- daily aggregate counters and bounded error categories;
- local unsent telemetry is removed when telemetry is disabled.

These are valuable privacy patterns, but the owned implementation must independently validate the runtime behavior rather than inheriting the claims.

## The product gap

The donor already has substantial spoofing logic. Reimplementing that logic alone would not create a meaningfully better product.

The real gap is **proof-bearing browser continuity + proof-bearing extension delivery**.

The owned product must answer all of these separately:

1. Did the policy intend to protect this exact tab/site?
2. Was the extension actually injected into the relevant document/frame?
3. Did the requested continuity behavior work without breaking ordinary page behavior?
4. What browser/version/runtime was tested?
5. What exact package SHA/digest was tested?
6. What exact package/version was submitted to the store?
7. What version is currently approved/published?
8. What version did a clean browser profile actually install?
9. Does that installed store build still pass the golden behavior suite?
10. If not, what is the rollback/recovery state?

No single badge, local test or CI job can answer all ten.

## Product boundary / safety boundary

The owned product is for legitimate continuity use cases such as:

- media or lectures that unnecessarily pause when backgrounded;
- live audio/stream pages;
- browser-based work tools whose background behavior is needlessly tied to page focus;
- user-controlled compatibility/testing of visibility behavior.

The product must not be positioned, optimized or tested for defeating:

- proctoring;
- assessment integrity systems;
- anti-cheat systems;
- other controls where hiding loss of attention would facilitate misconduct.

A generic “defeat all detection” product is explicitly out of scope.

## Important product decision: fingerprint randomization is not MVP

Fingerprint randomization is not required for the core continuity job and increases:

- site compatibility risk;
- attack surface;
- debugging difficulty;
- product ambiguity;
- user-permission/trust burden.

Therefore the clean-room MVP should omit fingerprint randomization. Reconsider it only if a separately defined privacy product requirement emerges with its own threat model and acceptance suite.

## MATCH / IMPROVE / NEW / OMIT

### MATCH

- per-tab protection;
- Always-On sites;
- visibility/focus continuity;
- timing/media continuity where necessary;
- cross-origin frame support where browser APIs permit;
- service-worker/restart reconciliation;
- no mandatory account;
- opt-in anonymous aggregate telemetry;
- uninstall feedback;
- Chromium Manifest V3 first.

### IMPROVE

- minimum-necessary protection profiles instead of one broad mode;
- explicit media/visibility/compatibility-safe modes;
- narrower/dynamic host permission strategy where browser APIs permit;
- deterministic disable/clear/reload behavior;
- real state reconciliation instead of badge optimism;
- extension-conflict diagnostics;
- CPU/battery/resource budgets;
- per-site compatibility state and failure reasons;
- self-test page showing observed capabilities;
- restart/update/navigation/iframe regression suite;
- exact public/test-store version testing in a clean browser profile;
- repository/build/submission/approved/published/installed version-drift detection;
- rollback rehearsal before production readiness;
- inspectable telemetry payload and local deletion controls.

### NEW

Owned contracts:

- `browser-continuity-policy/v1`
- `browser-continuity-session/v1`
- `compatibility-profile/v1`
- `continuity-diagnostic/v1`
- `extension-build-receipt/v1`
- `store-submission-receipt/v1`
- `store-version-observation/v1`
- `extension-release-certification/v1`
- `uninstall-feedback/v1`

Owned product capabilities:

- golden compatibility pages;
- release-version watchdog;
- clean-profile exact-store smoke test;
- post-update health check;
- rollback/recovery receipt;
- browser/store release dashboard in the shipping console;
- explicit `unknown` / `unsupported` / `conflict` states.

### OMIT / DEFER

- donor branding/copy/assets/trade dress;
- fingerprint-evasion arms race;
- proctoring/anti-cheat/assessment bypass;
- remotely hosted executable code;
- mandatory cloud account;
- hidden telemetry;
- browsing-history collection;
- Firefox/Safari parity in first slice;
- production Chrome Web Store writes without explicit authorization.

## Owned architecture

```text
Popup / Settings / Self-Test
          |
          v
Continuity Policy Engine
(tab/site + capability profile)
          |
          v
MV3 Registration + Injection Adapter
(document_start / MAIN world / scoped frames)
          |
          +--> Visibility Adapter
          +--> Focus Adapter
          +--> Timing / Media Adapter
          |
          v
State + Reconciliation Layer
(service worker / tab / page flag / navigation)
          |
          +--> Compatibility Diagnostics
          +--> Local Resource Observations
          +--> Optional Aggregate Telemetry

Shipping system (outside extension authority):
exact source SHA
  -> package + digest
  -> fixture/browser CI
  -> trusted/test store item
  -> clean-profile installed-version test
  -> controlled production submission
  -> approved/published observation
  -> production clean-profile install
  -> golden runtime smoke
  -> release certification receipt
  -> monitor / rollback
```

The shipping system is deliberately outside ordinary extension runtime authority.

## Phase A contracts

### `browser-continuity-policy/v1`

Required fields:

- policy ID/version;
- exact tab/site/origin scope;
- enabled capabilities;
- denied/unsupported capabilities;
- permission requirements;
- compatibility mode;
- deterministic digest.

### `browser-continuity-session/v1`

Required fields:

- tab/frame scope;
- policy digest;
- desired state;
- observed activation state;
- page/navigation generation;
- reconciliation result;
- restricted/unsupported-page state;
- deterministic session/observation digest.

The session contract must not become a browsing-history ledger.

### `continuity-diagnostic/v1`

Required fields:

- browser/version/platform;
- extension version + build digest;
- fixture/target test identity;
- capability tested;
- baseline observation;
- protected observation;
- resource/compatibility warnings;
- `pass | fail | unknown | unsupported | conflict`;
- evidence references.

Badge/UI state alone can never satisfy this contract.

### `extension-release-certification/v1`

Bind exact:

- source revision;
- manifest version;
- package digest;
- CI/build receipt;
- store item/channel;
- submitted version/artifact identity;
- review state;
- observed published version;
- clean-profile installed version;
- runtime smoke receipt;
- rollback candidate/version;
- terminal certification state.

Any identity/version mismatch is `release_drift`, never success.

## Failure model / negative tests

1. Protection OFF leaves page globals untouched.
2. Input focus/blur and form validation remain functional.
3. Ordinary element hover/mouseleave behavior remains functional.
4. Page visibility/focus changes occur only under an active policy.
5. Unselected tabs/sites do not receive protection.
6. Cross-origin/nested frames remain in-policy where supported.
7. Navigation does not silently lose protection while badge stays green.
8. Restricted Chrome pages are explicit `unsupported`.
9. One invalid Always-On entry cannot disable other valid entries.
10. Concurrent settings/registration changes do not leave duplicate/missing script registrations.
11. Service-worker suspension does not silently lose authoritative session truth.
12. Browser restart/session restore reconciles desired vs actual state.
13. Toggle OFF has a deterministic clear/reload result.
14. Conflicting extensions produce a conflict/unknown state rather than false attribution.
15. CPU/background use remains within an explicit test budget.
16. Telemetry OFF causes no telemetry network send.
17. Telemetry ON sends only schema-approved aggregate fields.
18. Uninstall feedback carries no hidden stable user identifier.
19. Package/test/store/installed version mismatch blocks certification.
20. Local unpacked success cannot satisfy store-runtime certification.
21. Rollback is rehearsed in a non-production/test lane.
22. Documentation and fixtures do not optimize for cheating/proctoring bypass.

## Chrome Web Store shipping implication

Current Chrome Web Store tooling supports API-based package upload, publication/status inspection and trusted-tester flows. Percentage rollout has eligibility constraints and therefore must not be assumed for a small/new extension.

Recommended early release sequence:

`fixture tests -> reproducible package -> trusted/test store lane -> clean-profile install -> production approval gate -> published-version observation -> production clean-profile install -> golden smoke -> monitor -> rollback if necessary`

Production publication remains an explicit authority gate even if upload/status tooling becomes automated.

## Roadmap

### P0 — evidence / reconstruction — first pass complete

- [x] resolve source thread;
- [x] resolve product/repository;
- [x] pin upstream revision/license;
- [x] inspect manifest/runtime/core/telemetry;
- [x] capture release-failure story;
- [x] internal dedupe;
- [x] clean-room/product boundary;
- [ ] durable competitor matrix;
- [ ] current exact store-item/version evidence snapshot.

### P1 — contracts + fixture corpus

- [ ] freeze owned contracts;
- [ ] create media fixture;
- [ ] form/input focus fixture;
- [ ] SPA/React-style focus fixture;
- [ ] timer/rAF/video-frame fixture;
- [ ] nested/cross-origin iframe fixture;
- [ ] navigation/reload fixture;
- [ ] restricted-page/unsupported matrix;
- [ ] privacy/permission threat model;
- [ ] canonical digest tests.

### P2 — clean-room minimal MV3 vertical slice

- [ ] popup;
- [ ] per-tab policy/session;
- [ ] minimal visibility/focus adapters;
- [ ] state reconciliation;
- [ ] package build/digest;
- [ ] browser fixture automation;
- [ ] no fingerprint randomization;
- [ ] no network dependency for core operation.

### P3 — media/timing continuity

- [ ] add only timing behavior proven necessary by fixture evidence;
- [ ] resource budget;
- [ ] compatibility fallback;
- [ ] background/foreground runtime receipts.

### P4 — Always-On + permission narrowing

- [ ] explicit site-grant workflow;
- [ ] permission-state projection;
- [ ] invalid-pattern isolation;
- [ ] settings/reconciliation tests;
- [ ] per-site compatibility profiles.

### P5 — diagnostics + privacy telemetry

- [ ] self-test;
- [ ] conflict diagnostic;
- [ ] opt-in aggregate telemetry;
- [ ] payload preview/delete controls;
- [ ] uninstall feedback.

### P6 — release certification

- [ ] exact-SHA build receipt;
- [ ] package digest;
- [ ] trusted/test item lane;
- [ ] store status/version observer;
- [ ] clean-profile install verifier;
- [ ] public version/installed version assertion;
- [ ] rollback rehearsal;
- [ ] release-drift alert.

### P7 — real-browser / platform UAT

- [ ] Chrome stable selected versions;
- [ ] Chrome beta compatibility where useful;
- [ ] macOS UAT;
- [ ] Windows UAT;
- [ ] Edge/Brave only after independent certification;
- [ ] restart/update/recovery;
- [ ] accessibility and popup/options layout.

### P8 — production certification

- [ ] privacy/store disclosure reconciliation;
- [ ] exact-head CI;
- [ ] exact-store-version runtime receipt;
- [ ] production observation/monitoring;
- [ ] rollback path;
- [ ] operator UAT;
- [ ] explicit owner production gate;
- [ ] tracker promotion from evidence only.

## Clean-room / license boundary

Focus Spoofer is Apache-2.0. Direct source reuse is possible if license/notice obligations are respected, but the default posture is an independently authored product/runtime because the goal is to improve architecture and release truth rather than fork branding and implementation wholesale.

If upstream code is intentionally reused later:

- record exact upstream file + SHA;
- preserve applicable copyright/license/NOTICE material;
- record modifications and provenance;
- isolate inherited code from owned contracts/product identity;
- independently verify behavior.

## Evidence ladder

`Static -> Unit -> Browser Fixture -> Integration -> Restart/Recovery -> Exact-head CI -> Test-store install -> Production-store install -> Real-browser UAT -> Release monitoring/rollback`

No stronger status may be inferred from weaker evidence.

## Current state

`SOURCE=done / EVIDENCE=done-first-pass / RECONSTRUCTION=done-first-pass / PRODUCT_THESIS=done-first-pass / SPECIFICATION=initial / IMPLEMENTATION=not-started / STORE_CERTIFICATION=none / DEPLOYMENT=none`

## Explicit non-claims

No Focus Spoofer parity. No copied donor implementation. No owned extension implementation. No Chrome Web Store item. No hosted/public deployment. No browser/platform certification. No Edge/Brave parity. No fingerprint-defense promise. No assessment/proctoring bypass capability. No `SHIPPED` claim without exact implementation, CI, store-installed-version, restart/recovery, UAT and rollback evidence.