# Easy To Do List → Apple-native Task Capture + Planner

Research snapshot: 2026-10-16 ET

Canonical tracker: #225

Primary user source: https://www.reddit.com/r/GenAiApps/s/WYIGpn3uAM

Resolved product: `Easy To Do List: Task,Reminder`, App Store id `6756335040`, developer/provider Shehab Hegazy.

## Disposition

`STANDALONE_PRODUCT_CANDIDATE + SHARED_APPLE_CAPTURE/ACTION/SYNC_PRIMITIVE_DONOR`

There is no direct personal task/planner duplicate in the Agent Work OS issue tracker. This product should not be folded into Agent Work OS Flow/Work Queue. Agent Work OS owns the research/evidence/verification/Shipping OS truth only.

Per repository-routing policy, the implementation belongs in a dedicated repo. Proposed neutral repo: `rrahul0904/task-capture-planner`. The currently connected GitHub action surface cannot create repositories, so the dedicated repo is required but not yet created.

Do not assign a new `RE-*` identifier until collision-free tracker reconciliation.

## Evidence classes

### Observed/public

Public App Store / launch surfaces expose:

- fast task capture;
- natural-language time detection;
- Today/Scheduled/Overdue/Completed smart views;
- lists, moving tasks and drag/drop;
- grocery auto-grouping;
- Home Screen widgets;
- Lock Screen / Control Center quick actions;
- Siri/Shortcuts-oriented task entry;
- Apple Watch companion;
- iCloud/device sync;
- light/dark presentation;
- custom snooze/reminder behavior;
- current Apple privacy disclosure indicating data is not collected.

Public version notes show iterative additions/fixes around smart dates, Mac/iPad support, Watch, widgets/sync, grocery categorization, Siri/Shortcuts, quick system capture surfaces, onboarding/settings/premium UI and snooze behavior.

### Unknown donor internals

Do not infer:

- SwiftUI/UIKit/AppKit implementation;
- SwiftData/Core Data choice;
- CloudKit schema/conflict semantics;
- temporal parser implementation;
- speech stack;
- grocery categorizer;
- notification reconciliation implementation;
- widget snapshot propagation;
- premium entitlement internals.

### Clean-room derived design

Our implementation may use public Apple primitives such as SwiftUI, App Intents, WidgetKit controls, SwiftData/Core Data and private iCloud/CloudKit sync. Those are our engineering choices, not donor facts.

## Competitive conclusion

Structured and TickTick already provide much broader planning/task feature depth, including recurrence, richer widgets, calendars, planning/AI features and large mature user bases. Therefore generic feature parity is a weak product strategy.

The wedge should be:

> privacy-first, account-optional, Apple-native capture everywhere with deterministic parsing, offline-first local truth, trustworthy multi-surface actions and transparent sync/notification state.

## MATCH

- typed/voice/Siri/Shortcuts capture;
- natural-language schedule parsing;
- smart views;
- lists and drag/drop;
- grocery grouping;
- widgets/controls;
- iCloud sync;
- Watch;
- dark/light;
- custom snooze.

## IMPROVE

- deterministic parser before LLM;
- explicit parse preview/confidence for ambiguous dates;
- recurrence + timezone/DST semantics;
- stable IDs/revisions/tombstones;
- stale projections cannot resurrect state;
- notification reconciliation after edits, permission/timezone changes and recovery;
- UI/parser/grocery localization;
- VoiceOver/Dynamic Type/keyboard accessibility;
- export/import/restore;
- local-only zero-backend mode;
- no task content in analytics.

## NEW

- universal Capture Anywhere action across app, Siri, Shortcuts, Share Sheet, Control Center, Lock Screen, Action Button where supported, widgets and Watch;
- task creation provenance;
- `TaskActionReceipt` for every state transition;
- sync/notification diagnostic state;
- local correction learning for parser/category preferences;
- undo/recovery queue;
- benchmarked capture latency and convergence correctness;
- optional calendar-aware planning only after permission-scoped core reliability is proven.

## OMIT / DEFER

- donor branding/assets/trade dress;
- generic AI chat in MVP;
- collaboration/social;
- required hosted account/backend;
- Android/Web during Apple-native Phase A;
- Pomodoro/habit/project-management breadth before persistence/sync correctness;
- speculative model use for deterministic jobs.

## Clean-room architecture

```text
SwiftUI surfaces: iPhone | iPad | macOS | watchOS
        |
        +--> Capture Router
        |      typed | voice | Siri | Shortcuts | Share Sheet
        |
        +--> App Intents / WidgetKit
        |      widgets | Lock Screen | Control Center | Action Button
        |
        v
Task Domain Engine
        |
        +--> Temporal Parser
        +--> Grocery Categorizer
        +--> Notification Reconciler
        +--> Search / Smart Views
        |
        v
Local Persistence
        |
        +--> optional private iCloud/CloudKit sync
        +--> export/import
        |
        v
App / Widgets / Watch / Notifications
```

## Owned contracts

- `task-item/v1`
- `task-list/v1`
- `capture-intent/v1`
- `temporal-parse/v1`
- `grocery-item/v1`
- `notification-plan/v1`
- `sync-revision/v1`
- `task-action-receipt/v1`
- `widget-snapshot/v1`

Contract invariants:

1. stable entity identity is never derived from display text;
2. stale surface actions cannot overwrite a newer task revision silently;
3. duplicate action retry is idempotent;
4. task persistence completes before a system control reports action success;
5. ambiguous temporal input remains ambiguous until the configured policy/user resolves it;
6. sync state is separate from local persistence truth;
7. notification scheduled state is separately observed from task state;
8. local use remains functional when iCloud is unavailable;
9. task content is excluded from ordinary telemetry by default.

## Required adversarial/recovery fixtures

Temporal:
- `tomorrow at 5` over timezone/DST boundaries;
- `next Friday` ambiguity;
- date-like text inside task titles;
- locale changes after task creation;
- deterministic parser replay.

Persistence/actions:
- duplicate widget completion;
- kill before vs after persistence acknowledgement;
- stale edit;
- delete/restore;
- complete/uncomplete retries.

Widgets/Watch:
- stale snapshot cannot resurrect deleted/completed task;
- concurrent Watch+iPhone completion converges;
- locked-device privacy redaction;
- app/widget version/schema mismatch.

Notifications:
- snooze retry;
- edit reschedule without duplicates;
- complete/delete cancellation;
- permission denied/revoked;
- timezone change;
- restart/reinstall recovery.

Sync:
- concurrent edit/delete;
- order/list-move conflicts;
- iCloud unavailable/reconnect;
- account sign-out/switch;
- migration from old schema fixtures;
- explicit failure/retry state.

Localization/grocery:
- English + Arabic grouping;
- user category correction;
- unknown item confidence;
- RTL UI/date formatting.

## REA runtime packet

Only use an authorized normal App Store install and public behavior. Do not decompile/transplant proprietary material.

Capture:

1. exact app/version/device/OS;
2. create/edit/move/complete/delete flow observations;
3. fixed temporal phrase matrix;
4. widgets/Lock Screen/Control Center;
5. offline behavior;
6. two-owned-device iCloud convergence;
7. concurrent edits/deletes/completions;
8. notification/snooze behavior;
9. Watch behavior;
10. grocery behavior;
11. kill/relaunch persistence;
12. bounded public network-egress observation;
13. evidence graph `OBSERVED | DERIVED | HYPOTHESIS | UNKNOWN`;
14. behavioral comparison to independently authored implementation.

## Phases

### P0 — first-pass evidence / placement
Done: source identity, App Store inventory, competitor scan, internal duplicate search, standalone classification. Pending: dedicated repo creation, dated evidence archive and authorized REA runtime packet.

### P1 — contracts + fixtures
Freeze schemas, canonical serialization/digests, time/DST corpus, English/Arabic grocery fixtures, action/sync state machine, notification matrix and privacy threat model.

### P2 — offline vertical slice
Independent SwiftUI shell + local persistence + lists/tasks + create/edit/move/complete/delete/undo + smart views + deterministic parser + local notifications + export/import skeleton + crash/restart recovery. No account/backend.

### P3 — Apple system surfaces
App Intents + Siri/Shortcuts + widgets + Lock Screen + Control Center + Action Button where supported + Share Sheet. Pass stale-state/idempotency tests.

### P4 — iCloud sync
Private iCloud/CloudKit lane, schema versioning, multi-device conflict/tombstone handling, offline/reconnect, account-change tests and sync diagnostics.

### P5 — Watch / grocery / localization
watchOS capture/complete, complications/controls where useful, categorizer/corrections, Arabic/RTL first-class fixtures, then broader locales.

### P6 — planner depth
Only after core reliability: recurrence, subtasks/notes if validated, calendar integration, planning suggestions and imports.

### P7 — benchmark / accessibility / privacy
Capture latency, parser accuracy/ambiguity, multi-device convergence, notification reconciliation, VoiceOver/Dynamic Type, performance/energy, privacy review and independent verification.

### P8 — signed device UAT
Exact-head CI; physical iPhone/iPad/Mac/Watch; airplane mode; two-device conflict; migration; TestFlight artifact/source binding.

### P9 — release certification
Privacy metadata/IAP reconciliation if used; exact-SHA release receipt; published App Store observation; clean-device public install; production smoke/recovery; only then `SHIPPED`.

## Bounded implementation agents after repo creation

- TASK-01 Domain/Persistence
- TASK-02 Temporal Parser
- TASK-03 Notifications
- TASK-04 App Intents/System Capture
- TASK-05 Widget Projections
- TASK-06 iCloud Sync
- TASK-07 Watch
- TASK-08 Grocery/Localization
- TASK-09 UX/Accessibility
- TASK-10 Independent Verification/Release

Supervisor owns integration and release truth. No worker gets a copy of unrestricted project authority.

## Current truth

`RESEARCHED-first-pass / RECONSTRUCTED-first-pass / SPECIFIED-initial / REA_RUNTIME=not-run / IMPLEMENTATION=not-started / DEVICE_UAT=none / PRODUCTION=none / SHIPPED=no`

No donor source access, no donor-internal architecture claim, no parity, no implementation, no deployment, no RE number yet.
