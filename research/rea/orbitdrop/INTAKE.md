# REA OrbitDrop — evidence-backed intake (2026-10-20)

## Identity and status
- Intake authority: [issue #332](https://github.com/rrahul0904/agent-work-os/issues/332)
- Reddit: https://www.reddit.com/r/ProductivityApps/comments/1xan6wn/ — u/Street-Tax4341
- Source: https://github.com/i3sam/OrbitDrop — inspected exact SHA `e545904098a4afeb42d4ffde8ee566a88e06a959`
- Release verified: `v0.3.4-alpha`, published 2026-10-20 12:15:54 UTC.
- Routing: `STANDALONE_PRODUCT_CANDIDATE`; **do not create a duplicate product repository until dedup/approval**. Agent Work OS tracks and supervises, REA observes/specifies; eventual application code belongs in an owned product repo.
- Master tracker ID: **pending canonical reconciliation** (no invented RE-* identifier).

## Evidence levels and actual source observations

| Claim | Level | Support | Limitation |
|---|---|---|---|
| Shift during Explorer drag opens radial Convert/Tools/Actions wheel | documented + owner-reported manual verification | README; docs/research/02-feasibility-report.md; src/OrbitDrop.Windows/DragDrop; src/OrbitDrop.App/InteractionController.cs | No independently run Windows UAT |
| Windows 10/11 supported | published target | README; net10.0-windows10.0.19041.0 | Windows 10 signoff and high DPI pending |
| File operations do not change original conversions | source-level behavior + owner preliminary evidence | src/OrbitDrop.Core/SafeOutput.cs; preliminary 19/19 hash-checked samples | Test under races, symlinks, permissions, disk full |
| Local processing without uploads | author claim + code topology evidence | Windows WIC/Media Foundation, local PDF and tools | Audit all network paths, especially update |
| 'No tracking' | author claim | Reddit/README | Requires static/dynamic telemetry/network audit |
| 0% idle CPU | author claim | Reddit comment | Benchmark on representative Windows hardware |
| Update integrity | source-level implementation | src/OrbitDrop.Infrastructure/Updates/UpdateService.cs | SHA256SUMS from same release channel does not authenticate publisher; code signing pending |
| Release CI tested | workflow defined | .github/workflows/ci.yml | Did not independently execute .NET/Windows CI; probe/UI steps allow continue-on-error |
| Licensing | repository declares MIT | LICENSE; THIRD-PARTY-NOTICES.md | PDFsharp 6.2.4 MIT pinned; dependency and asset audit before reuse |

## Public signal / competitors
- Creator says inspired by a paid, macOS-only radial-file product. Upstream notices explicitly mention Tangerine; do not claim novel invention of this gesture.
- [Tangerine](https://apps.apple.com/us/app/tangerine-file-converter/id6813034065?mt=12): macOS drag+Shift wheel; file converters, edits and transforms; app-store listing.
- [Filee](https://github.com/KnifeLemon/Filee): 2026 Windows free MIT radial converter with broader format ambitions; verify source and shipping claims separately.
- [File Converter](https://github.com/Tichau/FileConverter): GPL-3 context-menu Windows converter; good non-tray workflow comparator.
- Reddit feedback: dark-mode accent shade issue (release v0.3.4 claims fix), background-tray-process challenge, novelty/differentiation debate, desire for Rust cross-platform competitor.

## Inferred system architecture (not an assertion about future ownership)
Explorer/Finder/file-picker -> OS-specific adapter -> input snapshot and policy -> operation registry / type resolution -> background job -> sandboxed codec/provider -> transactional output coordinator -> integrity validation -> result/undo manifest -> status UI. OS-specific adapters contain Win32/COM vs macOS Finder/Accessibility/Services vs Linux portal/Wayland/X11. Mobile workflows use file-picker/share extension; **do not promise global drag hooks on iOS/Android**.

## P0 roadmap & gates
1. Source proof and license chain, platform feasibility matrix, prior-project dedup and tracker identity.
2. Behavior specs: copy-only for conversions; explicit move confirmation; cancellation and reject partial outputs; filenames, collisions, and multi-file policy; progress and consistent keyboard navigation.
3. Safety core: scratch + validation + publish-without-overwrite + input hashes + cleanup + crash recovery + per-job receipts. Adversarial tests for symlink/reparse-point/path traversal/ZIP slip and codec bombs.
4. Windows native integration: input gesture and completion tests on physical Windows 10/11 at 100/150/200% DPI, multiple monitors, keyboard/Esc, non-shell drags, and false-trigger scenarios.
5. Real codec golden fixtures: full compatibility matrix; validate decoded output (not just nonzero bytes), metadata strip/redaction, compression quality and target size, PDF merge integrity.
6. Desktop ports: macOS Finder adapter and Linux desktop capabilities only after measured feasibility; compare ease and accessibility with Tango/Tangerine/Filee.
7. Verification / shipping: unit+integration+adversarial tests, accessibility, performance budgets, signed binaries, SBOM, update provenance, independent reviewer, exact-SHA receipts and approval for merge/production.
8. Mobile: optional separate share-sheet/picker workflow. Do not treat platform constraints as bugs that an agent may bypass.

## Prototype scope
`safe-output.mjs` and `safe-output.test.mjs` are an **independently written Node standard-library research harness**, not upstream-derived application code. They show a bounded proof of output collision handling, source preservation, validation and cleanup; do not count as a Windows product, format codec, hosted service, or release. The model uses hard links on local filesystems and is NOT a cross-device/cloud/network-filesystem-ready transaction protocol.

Run: `node --test research/rea/orbitdrop/safe-output.test.mjs` (Node >= 22).
Local proof (2026-10-20): 9/9 tests pass in the isolated research runtime. **GitHub exact-head CI / real Windows/UAT / app-store approval: NOT VERIFIED.**

## Security and clean-room boundary
Respect upstream MIT and third-party notice obligations, but do not copy upstream branding, screenshot assets or UI. Source inspection informs understanding; behavior spec and proof harness are independently authored. No confidential code, credentials, privileged shell operations or irreversible writes. No merge, release, install or deployment from this research branch without a separate gate.
