# Focus Spoofer — Market + Store Evidence Addendum

**Snapshot:** 2026-10-11  
**Parent issue:** #144  
**Parent dossier:** `docs/reverse-engineering/focus-spoofer-browser-continuity.md`

## Exact public store observation

Chrome Web Store item:

- name: Focus Spoofer;
- extension ID: `ejgeaphjlcnmjgadkcljhchgbaiioihh`;
- observed public version: `1.8.1`;
- observed update date: 2026-10-10;
- observed store users: 897;
- observed ratings: 7 at 5.0;
- observed size: 38.88 KiB;
- store copy says optional anonymous stats are off unless enabled;
- store copy reports v1.8 reliability changes and v1.8.1 uninstall feedback.

At the same 2026-10-11 snapshot, inspected upstream `main` is:

- commit `080c87268c4775f6db368f224536c34ef7a800ba`;
- manifest version `1.8.2`.

Therefore a one-patch **source/store version delta exists at the observation time**:

`repo manifest 1.8.2 != public Chrome Web Store 1.8.1`

This does **not** prove a broken deployment; review/publication can legitimately lag source. It does prove the exact class of state that our release-certification contract must represent rather than collapsing both into “current version.”

Required modeled states include:

- source version;
- package version/digest;
- submitted version;
- under-review version;
- approved version;
- published version;
- clean-profile installed version;
- observed runtime version.

A version delta is `pending | expected_lag | release_drift | rollback | unknown` depending on the associated store/submission evidence; it is never automatically failure or success.

## Competitor snapshot

This is an established extension category, so differentiation cannot be “we also spoof `document.hidden`.”

### Always active Window — Always Visible

Observed Chrome Web Store surface:

- around 300,000 users;
- Featured / follows recommended practices;
- per-host enablement after a breaking change because always-active behavior can disrupt sites;
- visibility state override plus focus/event handling;
- public messaging centered on background media/resources.

Product lesson:

**Per-site scoping and compatibility are mature-market expectations, not differentiators.** The breaking-change note is direct evidence that globally applying the behavior creates compatibility/performance risk.

### Page Visibility API Blocker

Observed store surface:

- around 1,000 users;
- per-site rules / global mode;
- no-data-collection positioning;
- document-start MAIN-world registration;
- reload after state change;
- visibility/focus blocking.

Product lesson:

**Local-only privacy, site lists and reload-based clearing are commodity features.**

### StayActive

Observed store surface:

- small/new product;
- visibility/focus/blur continuity;
- media/timer use case;
- privacy/no-data positioning.

Product lesson:

The low-end market can reproduce basic spoofing cheaply; feature count alone is weak defensibility.

### TabRevive

Observed store surface:

- background-tab continuity positioning;
- per-tab control;
- reload persistence;
- inactivity/timeouts/background throttling use cases.

Product lesson:

Marketing is broadening from Visibility API spoofing into a general “tab keep alive” job. Our product should be precise about which continuity guarantees are actually tested rather than promise every kind of inactivity/session prevention.

## Community compatibility signal

Older public extension discussion reports that overly broad `mouseleave` handling can break tooltips/menus. This matches the donor's own later effort to preserve ordinary element-level focus/hover behavior.

Translate into acceptance requirements:

- page-level `mouseleave`/focus behavior must be distinguished from element-level UI interactions;
- ordinary forms, React-style focus handlers, menus and tooltips are golden compatibility fixtures;
- broad event suppression must fail the compatibility suite even if a video keeps playing.

## Market boundary

This is **not** an empty market. A large established extension already serves the basic “always active/visible” job.

Therefore Browser Continuity Guard should differentiate on:

1. exact runtime diagnostics — not only an ON badge;
2. capability profiles — apply only the minimum behavior needed;
3. compatibility certification — forms/menus/SPAs/iframes/navigation;
4. resource budgets — background continuity without uncontrolled CPU cost;
5. privacy truth — observable telemetry-off behavior;
6. store release truth — exact source/package/submission/published/installed identities;
7. clean-profile store tests — actual store builds, not only unpacked builds;
8. rollback/recovery receipts;
9. conflict/unknown states instead of confident false attribution;
10. a narrow legitimate continuity positioning rather than generic stealth/evasion.

## Competitive decision

**Do not compete on spoofing breadth.**

The owned wedge is:

> Reliability-certified browser continuity for selected pages, with exact release/store truth and compatibility diagnostics.

The actual technical continuity layer can remain comparatively small. The differentiated system is the combination of minimal runtime, deterministic diagnostics and a shipping pipeline that proves what users actually received.

## P0 update

With this addendum, first-pass P0 now has:

- source resolved;
- upstream pinned;
- current public store item/version observed;
- current source/store version delta recorded without overclaiming;
- direct category competitors captured;
- compatibility/failure signal translated into acceptance requirements;
- differentiation boundary recorded.

Broader pricing/review-sentiment research can continue later, but it is no longer required to begin contract/fixture specification.