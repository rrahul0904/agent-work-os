# REA intake: DoneAgo → Beesnote last-done memory
Date: 2026-10-20. Governance: [issue #331](https://github.com/rrahul0904/agent-work-os/issues/331).

**Disposition:** DONOR/EXTENSION of planned Beesnote Rebuild; this repository is only the intake/evidence/prototype staging location. No production integration or standalone repository creation. The previously planned `rrahul0904/beesnote-rebuild` is not presently accessible.

## Source and identity
- Original Reddit r/ProductivityApps post: https://www.reddit.com/r/ProductivityApps/comments/1xartf4/ (u/AttemptRude6364)
- Product: https://doneago.com/
- Android: https://play.google.com/store/apps/details?id=com.kryos.StateTracker
- iOS: https://apps.apple.com/us/app/doneago-last-time-tracker/id6762541875
- Publisher Plue Studio, iOS seller John Vincent Uyaco.
- Do not confuse the separate Android app `app.tinybrief.time` that shares the DoneAgo title.

## Evidence IDs and confidence
| ID | Public evidence | Inference/uncertainty |
|---|---|---|
| E01 | Card, state, timestamp, one-tap logging (website + stores) | Behavior only; no vendor source |
| E02 | History, photos, notes, tags, timeline, rhythm (Reddit and iOS listing) | Claims not independently runtime-verified |
| E03 | Auto switch, nudges, native widgets, platform-specific cloud (website + pricing) | Platform/plan variability |
| E04 | Expo/React Native + native Swift and Kotlin (author's Reddit reply) | Self-reported tech |
| E05 | 4,838 Android + nearly 2,000 iOS downloads; ~$3,600 gross (author's Reddit replies) | Self-reported, not audited |
| E06 | Weekly calendar window and sharing with partner (comments) | Feature requests, not proven shipped |
| E07 | Policy says no behavior analytics; store notices list analytics/activity/IDs | Privacy disclosure reconciliation needed |
| E08 | https://doneago.com/pages/terms prohibits reverse engineering/decompilation | No binary/APK/IPA/code/assets extracted |

## Clean-room behavioral contract
Immutable `ActivityEvent(id,cardId,stateId,atUTC,note)`. `statusAt` derives current state from the latest timestamped user event, with optional virtual timed transition (not silently appended). `rhythmFor` describes median intervals after >=3 completions. `attentionAt` distinguishes explicit intervals from inferred rhythms, no prescriptive medical claims. Duplicate event IDs are idempotent. Backfilled events are sorted by event time. Never infer log activity that was not recorded.

## Roadmap (separate implementation from proof)
- M0 evidence, rights, identity, dedupe: DONE.
- M1 independent local event engine + zero-dependency static browser demonstration: local Node tests 9/9, device UI not tested; see local artifact supplied in intake.
- M2 integrate into Beesnote-owned repo, support weekly windows across user timezone/DST, auditable edits/undo, secure local persistence.
- M3 opt-in cross-device/household sync with consent, revocation, tenant isolation, merge/conflict/restart tests, deletion/export.
- M4 optional React Native/native widgets/Watch, platform-specific device and accessibility matrix.
- M5 reviewer + exact-SHA CI, replay >=95%, 100% provenance, failure/security/perf receipts, and human shipping approval.
No production claims, deploys, merges, proprietary source inspection or irreversible provider writes.
