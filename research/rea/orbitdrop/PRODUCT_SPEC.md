# Owned local-first file operations — behavior contract / M0-M2 design

Governance: [#332](https://github.com/rrahul0904/agent-work-os/issues/332). Research PR [#336](https://github.com/rrahul0904/agent-work-os/pull/336). This is a **specification, not approval to ship or copy upstream**.

## Product boundary
An independently branded desktop-first utility that converts and transforms user-selected files **offline** with fast, discoverable contextual actions, non-destructive defaults and clear verification. Not Agent Work OS, and not a generic background agent with filesystem autonomy. Self Working Agent/REA supervises scoped research, owned specification, code review, tests and release gates. All file effects need path-scoped authorization.

## V1 workflows
1. **Pointer**: drag local file(s) from OS file manager → invoke user-configured trigger → platform adapter recognizes *actual* file URLs → radial menu shows only operations valid for the entire selection → user selects action or cancels → per-item job progress → validated output beside source → reveal/undo.
2. **Keyboard/accessibility**: select file(s) in the OS file manager → OS-supported global hotkey/context menu → operable menu/list with keyboard focus and screen-reader labels → confirm explicit destructive action → job status.
3. **Batch/mixed**: intersection of supported operations for all inputs; never silently skip incompatible files. Show preview of eligible/ineligible inputs; return per-file successes/errors and no partial directory publication for archive operations.
4. **Advanced local tools**: image conversion/compress/resize, PDF merge/split with declared order, media extract/trim, OCR and metadata strip. Provider must declare accepted MIME/magic, output type, licensing and file-size limit. No faux-universal conversion.
5. **Optional agent suggestion**: grounded, local file-type classification can propose an operation; no automatic reading, deletion, upload, sharing or execution without user-selected files and approval.

## Platform commitments (feasibility, not promises)
| Platform | Preferred entry | Gate |
|---|---|---|
| Windows 10/11 | Explorer gesture via Win32/OLE where permitted, keyboard + context fallback | physical DPI/dual monitor/false-trigger matrix |
| macOS | keyboard-triggered menu and user-approved drag/file selection; Finder menu extension only within supported scope | macOS permission and entitlement test; Finder Sync is primarily sync-oriented |
| Linux X11 | file-manager action/hotkey; drag gesture only if reliable | distro/desktop smoke |
| Linux Wayland | xdg-desktop-portal global shortcuts + file chooser; no unrestricted input snooping | compositor support and consent |
| iPadOS/iOS | share extension / Files document picker / NSItemProvider | no global drag interceptor claim |
| Android | ACTION_SEND/content URI/OpenDocument | scoped storage, permission durability |
| Browser | explicit File API picker/drop inside app | cannot modify arbitrary on-disk paths without user grants |

Apple Finder Sync: https://developer.apple.com/documentation/FinderSync
Linux GlobalShortcuts portal: https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.GlobalShortcuts.html
iOS NSItemProvider: https://developer.apple.com/documentation/foundation/nsitemprovider

## Build design
- **Shared core**: consider Rust for format registry, job queue, transactional output, metadata manifest, hashing and portable codecs; benchmark the tradeoff against .NET10 portability before committing. No unreviewed rewrites of upstream.
- **Native adapters**: keep Win32/OLE, AppKit/Finder, XDG and mobile share/file-provider APIs isolated from core.
- **UI**: accessible command list is always available; radial menu is enhanced interaction, not a sole path.
- **Format providers**: quality/accuracy/memory-risk contracts, typed input discovery, trust tier, sandbox/process isolation, explicit codec notices.
- **Safety**: default produces copy, unique naming, scratch in destination filesystem, output validation, no-overwrite final publish, consent for move/share, cancellation, disk-full/restart recovery and scrubbed logs.
- **Release**: per-platform signed and verified artifacts; update signature independent from same-channel checksum; SBOM/license and rollback evidence.

## Test contract / measurable exit criteria
| ID | Scenario | Acceptance |
|---|---|---|
| FX-01 | PNG→JPG supported fixture | decoding succeeds and original SHA256 unchanged |
| FX-02 | Unrecognized format | operation absent or explicit unsupported result; never fake extension-only conversion |
| FX-03 | Existing `photo.jpg` and concurrent writers | outputs unique; no existing bytes changed |
| FX-04 | Cancellation mid-write + disk full + worker crash | no published invalid output; scratch cleanup/recovery |
| FX-05 | Symlinks, junctions/reparse points and ZIP slip | cannot escape approved source/destination scope |
| FX-06 | 100 image files mixed MIME | declared intersection and per-input manifest, reproducible output validation |
| FX-07 | PDF merge three pages | ordered page count, text/vector preservation, no source mutation |
| FX-08 | Metadata redact/strip | verified absence of selected fields; no accidental loss of nonselected content |
| FX-09 | Shift-drag Windows matrix | Esc cancels, no unintended MOVE, no phantom menus, non-shell fallback |
| FX-10 | 100%, 150%, 200% scale dual display | wheel not off-screen; correct DPI/position/focus |
| FX-11 | Offline privacy enforcement | no file contents or names transmitted, except explicitly consented share action |
| FX-12 | Reproducible release | exact commit, locked deps, independent reviewer, signed build + update/rollback receipts |
| FX-13 | Screen reader/keyboard route | discover, select, abort and read errors without pointer |
| FX-14 | macOS/Linux/mobile | platform-appropriate entry passes or explicit unsupported behavior with no false equivalence |

## Quantitative **targets, not measurements**
P95 menu invocation after trigger < 50 ms on reference desktop; idle CPU below 1% under representative observation window; 100% no-overwrite in repeatable collision suite; no network payload of selected file bytes in offline runs; zero critical defects in release gate.

## Priorities
P0: prove safe conversion pipeline, independent codec tests and entry path on Windows.
P1: accessibility/performance, macOS feasibility and source/security review.
P2: Linux and mobile-specific file/share experience.
P3: optional local intelligent suggestions and workflow automation, never required for core utility.

## REA handoff
Observed/claimed/inferred/unknown evidence → independently written behavior contract → explicit WorkItem and path authorization → isolated build → deterministic + physical-machine verification → independent judge → exact-SHA receipt → approval-only merge/package/distribution → installed-system UAT, rollback and monitoring. Passing Node safety-unit tests alone does not close any platform release gate.
