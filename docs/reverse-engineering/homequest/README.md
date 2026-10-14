# HomeQuest — governed REA dossier

Status: `IMPLEMENTED_CORE / CI_PENDING / HOSTED_UAT_PENDING / MOBILE_BACKEND_PENDING / CERTIFICATION_PENDING`

Issue: #180

Branch: `reverse/homequest-household-game`

## Target identity

Reference target: **Mushom**, surfaced from the Reddit r/SideProject post “I built a household chores app and it actually works” on 2026-10-14.

Public reference surfaces used in this investigation:

- Reddit launch/update post: `https://www.reddit.com/r/SideProject/s/eht4qk5dub`
- Google Play listing: `https://play.google.com/store/apps/details?id=com.sfddev.mushom`
- Apple App Store listing: `https://apps.apple.com/us/app/mushom/id6762131981`
- Earlier public author post describing the original points/rewards motivation: `https://www.reddit.com/r/apps/comments/1rwxm7j/couldnt_find_a_fun_chore_app_for_couples_so_i/`

Our product identity: **HomeQuest** (internal working name only; launch naming/trademark review remains separate). HomeQuest is an independently authored household teamwork product. It does not copy Mushom source code, branding, screenshots, protected assets, private APIs, store copy, or hidden implementation details.

## Canonical roadmap

Target/Source → Discovery → REA Investigation → Evidence → Understanding → Reconstruction → Specification → Improvement → Build → Verify → Compare → Deploy → Certify.

REA is the governed reverse-engineering provider/capability layer. Agent Work OS remains responsible for provenance, clean-room boundaries, policy, implementation, verification, replay, deployment, and Shipping OS certification.

## REA evidence classification

### Observed

- The reference is positioned for couples, families, roommates, and shared households.
- Users can create, assign, prioritize, categorize, schedule, and complete household chores.
- Completing chores awards points.
- Households can define custom rewards that members redeem with points.
- A weekly shared points goal resets on a weekly cycle.
- A shared Focus/Pomodoro mode exists and chores completed during it receive a points bonus.
- A leaderboard compares household contributions.
- Shared expenses are recorded and the product calculates who owes whom.
- The product includes household chat, shared lists, calendar, and recurring home standards/routines.
- Changes are marketed as syncing in real time between household members.
- A user can belong to multiple homes.
- Recent releases add stats, daily streaks, a household activity feed, task templates, visual customization, daily personal goals, and streak protection.
- The US App Store lists Premium Monthly at `$4.99` and Premium Yearly at `$39.99` at the time of capture.
- Apple reports the app is designed for iPhone/iPad and compatible with Apple-silicon Mac via iOS app compatibility. Google Play exposes an Android build.

### Inferred

- A server-side household tenancy model is likely required for real-time multi-user state, but the reference backend/database/vendor is unknown.
- Push notification infrastructure is likely required for reliable cross-device reminders, but its provider is unknown.
- The exact Focus bonus formula, points accounting rules, recurring-task scheduler, conflict semantics, and expense settlement algorithm are not publicly specified.
- Premium entitlement management is required, but the reference billing vendor and entitlement model are unknown.

### Unknown / intentionally not claimed

- Source language/framework and mobile framework.
- Database schema.
- Authentication provider.
- API transport and private endpoints.
- Realtime vendor/protocol.
- Push-notification provider.
- Billing implementation.
- Analytics/crash tooling.
- Cryptographic/storage architecture.
- Exact UI component tree and private design assets.

### Verified in our build

- An independent browser implementation exists under `/homequest/`.
- The same tested domain module drives task completion, points, Focus bonus, rewards, weekly points, streaks, and expense settlement.
- The preview supports household dashboard, chores, rewards, focus timer, leaderboard/activity, expenses, shared list, chat, calendar, and standards.
- Demo state persists in browser local storage.
- Cross-tab demo state propagation uses `BroadcastChannel`/storage events and is explicitly labeled as local demo sync rather than server realtime.
- JSON state export is supported.
- Node tests cover focus bonus accounting, reward debit semantics, settlement calculation, streak calculation, and ISO week identity.

## Clean-room boundary

This implementation uses public behavior, public product descriptions, user-visible store metadata, and independently written code. It does **not** contain recovered/decompiled source, private endpoints, reference branding, reference screenshots, reference icons, reference prose, or copied application assets.

Binary/runtime REA inspection has **not** been executed. No APK/IPA was decompiled and no authenticated reference account was instrumented. Therefore this dossier does not claim exact internal parity. If an authorized artifact is later supplied, REA may add a separate evidence lane for network/storage/runtime behavior; those observations must remain provenance-tagged and cannot silently overwrite clean-room conclusions.

## Capability disposition

| Capability | Decision | Current state |
|---|---|---|
| Shared chores | MATCH | Browser core implemented |
| Assignment/categories/due state | MATCH | Implemented |
| Points per chore | MATCH | Implemented |
| Custom rewards | MATCH | Implemented |
| Weekly household goal | MATCH | Implemented |
| Focus/Pomodoro bonus | MATCH + SPECIFY | Implemented with HomeQuest-owned 25% rule; reference formula remains unknown |
| Leaderboard | MATCH | Implemented |
| Daily streak | MATCH | Core calculation implemented |
| Shared expenses | MATCH | Equal-split ledger + derived settlement implemented |
| Household chat | MATCH | Local preview implemented |
| Shared lists | MATCH | Local preview implemented |
| Calendar | MATCH | Local preview implemented |
| Home standards/routines | MATCH | Local preview implemented |
| Activity feed | MATCH | Implemented |
| Server realtime | MATCH | Production architecture specified; not shipped in preview |
| Multiple homes | MATCH | Production contract specified; not shipped in preview |
| Push notifications | MATCH | Production phase; not shipped |
| Stats/history | MATCH | Basic derived state exists; production analytics not shipped |
| Premium customization | MATCH | Entitlement architecture specified; billing not shipped |
| Exact Mushom UI/branding/assets | OMIT | Intentionally excluded |
| Exact Mushom pricing/copy | OMIT | Pricing strategy remains ours |
| Fairness/load balancing | NEW | Planned differentiator |
| Cooperative mode without ranking | NEW | Planned differentiator |
| Offline outbox/conflict policy | IMPROVE | Production requirement |
| Data export/delete controls | IMPROVE | Production requirement |
| Audit/event ledger | IMPROVE | Production requirement |

## Product thesis

The core loop is stronger than a generic to-do list:

`household work → visible ownership → points → shared goal → reward → repeat`

The product opportunity is not simply “another chore app.” The sellable wedge is **household teamwork with optional game mechanics**, with two behavioral modes:

1. **Competitive** — points, streaks, leaderboard, reward redemption.
2. **Cooperative** — shared progress, fairness/load balance, no ranking pressure.

That second mode is an intentional HomeQuest improvement: competition can motivate some households while creating friction for others.

## Current implementation slice

Files:

- `apps/web/public/homequest/index.html`
- `apps/web/public/homequest/styles.css`
- `apps/web/public/homequest/app.js`
- `apps/web/public/homequest/core.js`
- `services/control-api/test/homequest.test.js`

Functional preview behavior:

1. Switch between two household members to exercise independent balances.
2. Add chores with assignee, category, points, and due label.
3. Complete chores and award points.
4. Start a Focus timer; task completion during Focus receives HomeQuest's explicit 25% bonus.
5. Track spendable points separately from weekly contribution points.
6. Create and redeem custom rewards.
7. Track household weekly progress and a leaderboard.
8. Add equal-split shared expenses and derive settlement instructions.
9. Add/check shared-list items.
10. Send local household chat messages.
11. Add calendar events and recurring household standards.
12. Review recent activity.
13. Persist state locally and propagate state between browser tabs.
14. Export demo data to JSON.

## Production architecture

```text
                    ┌─────────────────────────────┐
                    │       HomeQuest clients      │
                    │ iOS / Android / Web / Tablet │
                    └──────────────┬───────────────┘
                                   │
                    authenticated HTTPS + realtime
                                   │
                    ┌──────────────▼───────────────┐
                    │       HomeQuest API/BFF       │
                    │ authz · validation · idempot. │
                    └──────┬────────┬────────┬──────┘
                           │        │        │
                    ┌──────▼───┐ ┌──▼─────┐ ┌▼──────────┐
                    │ Postgres │ │Realtime│ │ Job/Push   │
                    │ + RLS    │ │ events │ │ scheduler  │
                    └──────┬───┘ └────────┘ └────┬───────┘
                           │                      │
                    ┌──────▼───────────┐   ┌─────▼─────────┐
                    │ Event/audit log  │   │ APNs / FCM     │
                    │ outbox + replay  │   │ reminders      │
                    └──────┬───────────┘   └───────────────┘
                           │
                 ┌─────────▼──────────┐
                 │ Billing entitlement│
                 │ mobile + web       │
                 └────────────────────┘
```

### Recommended production data model

- `users`
- `households`
- `household_memberships`
- `invites`
- `tasks`
- `task_occurrences`
- `task_completions`
- `point_ledger`
- `weekly_goals`
- `rewards`
- `reward_redemptions`
- `expenses`
- `expense_splits`
- `lists`
- `list_items`
- `messages`
- `calendar_events`
- `standards`
- `standard_occurrences`
- `focus_sessions`
- `activity_events`
- `notification_preferences`
- `device_tokens`
- `entitlements`
- `audit_events`

Points should be ledger-derived, not mutable counters of record. Cached balances may exist for speed, but the immutable ledger is the replay and dispute source.

### Authorization contract

Every household-owned row carries `household_id`. Access requires an active membership. Role scopes:

- `owner`: billing, deletion, ownership transfer, all settings.
- `admin`: member management, templates, standards, reward/goal policy.
- `member`: household participation and ordinary CRUD.

No client-supplied `household_id` is trusted without membership authorization.

## Product improvements beyond parity

### P0: Fairness engine

Track workload by estimated effort, recurrence, undesirable-task weight, and recent contribution rather than points alone. Suggest rotations instead of automatically shaming low scorers.

### P0: Cooperative mode

Allow a household to disable member ranking while keeping a shared goal and rewards. The product should not force competition as the only motivational model.

### P1: Offline-first household state

Mobile mutations write to a local outbox with idempotency keys; server acknowledgements replace optimistic state. Conflicts surface intentionally for destructive edits rather than silently overwriting.

### P1: Transparent point rules

All point adjustments write a reason-coded ledger event: task completion, focus bonus, manual correction, reward redemption, weekly rollover, admin adjustment.

### P1: Privacy controls

Self-service export, account/household deletion, configurable activity retention, minimal diagnostics, and clear separation between functional financial data and payment-card data. HomeQuest does not need to store card numbers for shared-expense accounting.

### P2: Optional assistive intelligence

Template suggestions, recurring-task discovery, fairness hints, and natural-language household setup may use an AI provider, but ordinary household operation must remain fully functional without an LLM.

## Delivery phases

### Phase 0 — Evidence and clean-room contract

Status: **complete for public evidence lane**.

Outputs: target identity, evidence classification, capability disposition, clean-room boundary, implementation issue/branch.

### Phase 1 — Domain + interactive preview

Status: **implemented; CI pending**.

Outputs: domain core, responsive browser preview, unit tests, explicit prototype-truth messaging.

### Phase 2 — Identity, tenancy, and durable storage

Build authentication, households, memberships/invites, Postgres schema, row-level authorization, point/event ledgers, import/export, deletion path.

### Phase 3 — Realtime collaboration + recurring engine

Server realtime for tasks/lists/chat/focus sessions, recurring task/standard scheduler, idempotent completion events, conflict policy, activity feed.

### Phase 4 — Cross-platform mobile

Expo/React Native iOS + Android client with tablet layouts, offline cache/outbox, deep links/invites, background-safe timer behavior, native accessibility, push token lifecycle.

### Phase 5 — Notifications + billing

Push reminders, digest preferences, premium entitlement service, App Store/Play billing integration, web billing only if policy/architecture requires it.

### Phase 6 — Differentiation

Fairness engine, cooperative mode, rotation suggestions, templates, home-maintenance extensions, optional assistive AI.

### Phase 7 — Verification and Shipping OS

Exact-SHA CI, migration tests, RLS/authz tests, realtime race tests, offline/reconnect tests, mobile device UAT, accessibility checks, privacy/export/delete checks, billing sandbox tests, store-build receipts, staged deployment, production promotion gate.

## Verification contract

Before **preview-ready**:

- branch remains isolated from `main`;
- repository tests and acceptance checks pass;
- `homequest.test.js` passes on the exact branch SHA;
- `/homequest/` loads without third-party runtime dependencies;
- all six navigation surfaces are usable at desktop and mobile widths;
- task completion updates points, weekly goal, leaderboard, and activity consistently;
- Focus bonus is visibly our rule, not presented as the reference's exact rule;
- reward redemption cannot produce a negative balance;
- expense settlement sums to zero within currency rounding;
- local sync is never described as production server realtime;
- reset/export paths work;
- no reference trademark, icon, screenshot, protected copy, secret, or private endpoint is included.

Before **production certification**:

- durable authenticated backend exists;
- household row isolation/RLS tests pass;
- multi-home tenancy is verified;
- realtime convergence and reconnect behavior pass adversarial tests;
- idempotent completion/reward/expense mutations are proven under retry;
- notification preferences and token revocation work;
- account/household export and deletion are verified;
- mobile builds are signed and tested on physical iOS/Android devices;
- accessibility and reduced-motion behavior pass;
- billing sandbox and entitlement restoration pass;
- hosted artifact/build numbers map to exact Git commit SHA;
- production promotion produces a Shipping OS receipt.

No `SHIPPED`, `LIKE-FOR-LIKE`, or `PARITY VERIFIED` label is permitted before those receipts exist.

## Monetization shape

- **Free:** one household, core chores, shared list, basic points/rewards, calendar, limited history.
- **Plus household:** multiple households, stats/history, advanced templates, Focus/cooperative modes, richer automation, export/history controls, premium customization.
- **Co-living / small property tier:** larger membership, role policy, reusable standards/templates, common-area maintenance, admin audit/history, bulk invites.

The initial business should remain a household product rather than stretching prematurely into enterprise workflow software.

## Current shipping posture

A real independent core and browser product slice now exist on the isolated branch. The build is **not** yet a production replacement for the reference app because identity, server realtime, multi-home tenancy, mobile clients, push notifications, durable database state, billing, and store release are still future phases. The correct current state is `IMPLEMENTED_CORE`, not `SHIPPED`.
