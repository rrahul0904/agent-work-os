# Orbit Hours — REA reconstruction status

Run date: 2026-10-13

Target evidence: Reddit `r/indiehackersindia` post `PlTzgvqd3D` resolving to Google Play package `com.beingbriston.overlap` (Overlap - World Clock).

## Current verdict

`IMPLEMENTED_CORE_NATIVE_SOURCE_READY`

The clean-room build contains a shared TypeScript product core plus native Apple and Android shells. Targets are iPhone, iPad, macOS and Android. Implemented capabilities include people-centric world clocks, awake/asleep state, group filters, time travel, fair-time overlap scoring, calendar integration, local reminders, DST transition detection, a holiday-provider boundary with a small offline seed, a daylight globe, local-only storage/backups, and native widget adapters.

## REA governance

REA is the evidence/capability provider only. Agent Work OS remains authoritative for clean-room specification, native-effect policy, verification, release gates and receipts. No donor source, assets, branding, private API or recovered implementation is used.

## Verified in current environment

- TypeScript strict compile: PASS
- Domain/calendar assertions: PASS (12)
- Native packaging of exact web build into Apple + Android shells: PASS
- Local HTTP asset fetch: PASS

## Open shipping gates

- Full public-holiday provider
- Contact editor/timezone search
- Xcode iPhone/iPad/macOS builds and simulator/device UAT
- Android SDK/Gradle build and emulator/device UAT
- Widget refresh/restart UAT
- Accessibility/localization audit
- Store signing, privacy declarations and release receipts

Do not label this `SHIPPED_PRODUCTION` until those receipts exist.
