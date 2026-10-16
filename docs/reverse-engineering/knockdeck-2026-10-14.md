# REA case file: KnockDeck macOS tap-to-action utility

Date: 2026-10-14  
Agent Work OS issue: #187  
Implementation branch: `reverse/knockdeck-macos`

## 1. Source / target identity

Observed source behavior came from a public r/buildinpublic post describing **TapMac**, a small paid macOS menu-bar app. The post says the app uses the MacBook built-in accelerometer so a double-tap beside the trackpad can mute speakers or the microphone, with configurable left/right mappings. The source author describes Apple Silicon MacBooks on macOS 14+ and a one-time price of $4.99.

This REA case is a **behavioral reconstruction**, not a binary clone. We do not use TapMac branding, artwork, screenshots, executable code, private APIs discovered from its binary, payment assets, or proprietary source.

## 2. Evidence and capability discovery

Public evidence indicates the useful capability decomposes into five separable layers:

1. Apple Silicon motion-sensor access via the SPU HID device.
2. Impact/tap detection robust to resting gravity and typing noise.
3. Gesture grouping (single/double/triple tap).
4. Side classification for left/right chassis taps.
5. Local action dispatch (speaker mute, microphone mute, shortcuts/system actions).

Public implementation research also found several independently built products/projects around the same undocumented Apple sensor surface, which confirms feasibility and reveals important constraints:

- `olvvier/apple-silicon-accelerometer` — public research showing `AppleSPUHIDDevice`, vendor usage page `0xFF00`, accelerometer usage `3`, gyroscope usage `9`, 22-byte reports and fixed-point scaling. Public repo.
- `jaskirat1616/mactap-app` — MIT licensed native macOS app demonstrating SPU HID access and signed/notarized distribution. No source code copied into KnockDeck; used as feasibility/compatibility evidence.
- `shaircast/nocnoc` — MIT licensed native utility using IOKit HID and configurable knock actions. Used only as capability evidence.
- `brettinternet/mic-mute` / similar open CoreAudio utilities — evidence that global microphone mute can be implemented by setting CoreAudio device properties without recording microphone audio.

### License boundary

KnockDeck code in this branch was authored as a new implementation. No donor repository is vendored. If a future phase imports donor code, it must go through `third_party/` with exact upstream commit, license, NOTICE, provenance record, and independent review before use.

## 3. Clean-room product specification

Product name: **KnockDeck**.

Core promise: tap the MacBook chassis to run a local action without reaching for a key or hunting for an app-specific mute button.

Default V1 behavior:

- double-tap left → toggle speaker mute;
- double-tap right → toggle microphone mute;
- unclassified taps → no action;
- settings and learned calibration remain local;
- no telemetry/network runtime;
- no microphone recording.

Differentiation beyond the source observation:

- user-trained left/right calibration instead of assuming one gyro axis/sign works across every chassis;
- single/double/triple gesture engine with configurable trigger count;
- safe `unknown` side state rather than guessing before calibration;
- additional local actions (lock screen and Apple Shortcut);
- deterministic synthetic detector tests;
- explicit shipping gates for private/undocumented hardware interfaces.

## 4. Architecture

```text
┌────────────────────────────────────────────────────────────┐
│                    KnockDeck.app                           │
│                                                            │
│  AppleSPUHIDDevice                                         │
│  accel usage 3 ───────────────┐                            │
│  gyro  usage 9 ───────────────┤                            │
│                               ▼                            │
│                      SPUMotionSensor                        │
│                               │ MotionSample               │
│                               ▼                            │
│                        ImpactDetector                       │
│                               │ DetectedImpact             │
│                  ┌────────────┴────────────┐               │
│                  ▼                         ▼               │
│         calibration capture        SideClassifier          │
│                  │                         │ TapSide        │
│                  └────────────┬────────────┘               │
│                               ▼                            │
│                    TapSequenceRecognizer                    │
│                               │ TapGesture                 │
│                               ▼                            │
│                            AppModel                         │
│                               │                            │
│                               ▼                            │
│                    LocalActionExecutor                      │
│                     │        │        │                    │
│                  CoreAudio CGSession shortcuts             │
└────────────────────────────────────────────────────────────┘
```

`KnockDeckCore` contains platform-independent detection/classification logic. `KnockDeckApp` contains Apple-specific sensor and action adapters plus the SwiftUI menu-bar UI.

## 5. Data / privacy model

Persisted:

- threshold and gesture preferences;
- selected local actions;
- optional Apple Shortcut name;
- compact normalized calibration centroids.

Not persisted:

- raw sensor streams;
- microphone audio;
- keystrokes;
- browsing data;
- account identifiers;
- analytics events.

No server is required for V1 runtime.

## 6. Failure modes and controls

| Failure mode | Control |
|---|---|
| Mac model exposes no compatible SPU report | fail closed; listening remains off and UI reports unsupported sensor |
| HID open denied | fail closed; no keyboard simulation fallback in production |
| side calibration ambiguous | classify as `unknown`; default unknown action is `none` |
| accidental single hit during a double-tap setup | gesture emitted but ignored unless count matches configured trigger |
| CoreAudio mute property missing | best-effort volume fallback; otherwise return a visible error |
| private sensor API changes after macOS update | CI still checks compilation; hardware compatibility remains a release gate |
| app unsigned/not notarized | development artifact only; production release blocked |

## 7. Implementation phases

### Phase 0 — source identity / capability map
Status: complete for this case file.

### Phase 1 — clean-room native vertical slice
Status: implemented on `reverse/knockdeck-macos`.

Includes Swift package, gesture engine, side calibration, SPU sensor adapter, CoreAudio mute actions, menu-bar UI, deterministic tests, and development bundle script.

### Phase 2 — CI certification
Required: macOS GitHub Actions must compile, run tests, create the ad-hoc `.app` archive, and upload the artifact. Fix all compiler/test failures before marking this phase complete.

### Phase 3 — physical hardware certification
Required matrix (minimum):

- one MacBook Air and one MacBook Pro;
- at least two Apple Silicon generations where hardware is available;
- Sonoma 14 / Sequoia 15 / current macOS where practical;
- tap detection on desk and palm-rest chassis;
- left/right calibration quality;
- sleep/wake recovery;
- internal mic/speaker plus one Bluetooth/USB audio device.

### Phase 4 — productization

- login item with `SMAppService`;
- better calibration waveform/test view;
- per-app profiles;
- Shortcut/action catalog;
- update channel;
- support diagnostics that expose only local sensor/device metadata;
- accessibility review.

### Phase 5 — signed distribution

Credential gate: Developer ID certificate and notarization credentials must be supplied through protected CI secrets, never committed or pasted into issue text.

Shipping checks:

- Developer ID signature;
- notarization ticket stapled;
- `spctl --assess --type execute` accepted;
- immutable release asset tied to exact git SHA;
- Agent Work OS shipping receipt records source SHA, CI run, artifact digest, signer identity, notarization outcome, and hardware test evidence.

## 8. Deployment definition

For a native macOS utility, "deployed" has two different levels:

1. **Development deployment** — CI-generated ad-hoc app archive is installable for controlled testing. This can be automated without Apple signing credentials.
2. **Production deployment** — signed + notarized release distributed through a release channel and verified by Gatekeeper. This cannot be honestly claimed until the Apple credential and physical-hardware gates pass.

The project must not mark phase 5 or the Agent Work OS tracker as shipped solely because an unsigned/ad-hoc artifact exists.
