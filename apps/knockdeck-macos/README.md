# KnockDeck

KnockDeck is a privacy-first native macOS menu-bar utility that turns physical taps on an Apple Silicon MacBook into configurable local actions.

It was created as a governed REA (Reverse Engineer Anything) clean-room build after observing the user-facing behavior of TapMac. KnockDeck does **not** copy TapMac branding, artwork, binaries, private source, or UI. Public implementation research is recorded separately in the reverse-engineering evidence document.

## V1 behavior

- Reads the MacBook motion sensor exposed through `AppleSPUHIDDevice` on supported Apple Silicon laptops.
- Detects tap impulses locally from accelerometer samples.
- Groups impacts into 1-, 2-, or 3-tap gestures.
- Learns left/right signatures from a three-tap calibration flow instead of hard-coding a chassis axis.
- Maps left, right, or unclassified gestures to:
  - toggle speaker mute
  - toggle microphone mute
  - lock screen
  - run an Apple Shortcut
  - no action
- Keeps settings and calibration in local `UserDefaults`.
- Has no telemetry, analytics, account system, or network runtime dependency.
- Does not record microphone audio. Microphone mute uses CoreAudio device properties.

The default configuration mirrors the useful core interaction from the source observation: **double tap left → speaker mute; double tap right → microphone mute**. Until both sides are calibrated, side classification remains `unknown` and the default unknown action is `Do nothing`.

## Compatibility and constraints

KnockDeck targets macOS 14+ on Apple Silicon MacBooks. The SPU sensor path is undocumented by Apple, varies by model, and is not suitable for a Mac App Store assumption. Some devices or OS releases may deny the HID open or expose a different report topology. Hardware verification is therefore a release gate, not an optional check.

The current branch intentionally produces an **ad-hoc signed development artifact**, not a production release. A public production build must additionally pass:

1. hardware smoke tests on representative MacBook Air/Pro models;
2. sleep/wake and external-audio-device tests;
3. Developer ID signing;
4. Apple notarization;
5. Gatekeeper verification with `spctl`;
6. exact-SHA release receipt in Agent Work OS.

## Build and test

```bash
cd apps/knockdeck-macos
swift test
bash scripts/build-app.sh
open dist/KnockDeck.app
```

The package build creates `dist/KnockDeck-0.1.0.zip` with an ad-hoc signature for CI/development testing.

## Architecture

```text
AppleSPUHIDDevice accel/gyro
          │
          ▼
   SPUMotionSensor
          │ MotionSample
          ▼
    ImpactDetector
          │ DetectedImpact
          ├──────────────► calibration capture ─► SideClassifier
          │
          ▼
    SideClassifier
          │ TapImpact
          ▼
 TapSequenceRecognizer
          │ TapGesture (side × count)
          ▼
      AppModel
          │
          ▼
 LocalActionExecutor ──► CoreAudio / CGSession / shortcuts CLI
```

The detector/classifier/sequence logic lives in `KnockDeckCore` and is hardware-independent, so CI can verify the behavior with deterministic synthetic motion samples.

## Privacy model

Sensor reports and gesture classification stay on the Mac. No raw motion history is persisted. Calibration stores only compact normalized centroids. Audio controls change mute/volume properties; KnockDeck does not open an audio capture stream.

## Project tracking

Agent Work OS issue: `#187` — `REA: build KnockDeck macOS tap-to-action utility`.
