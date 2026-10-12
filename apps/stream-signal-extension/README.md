# Stream Signal — Phase-A vertical slice

Clean-room prototype derived from public product behavior researched in issue #149.

## What is implemented

- Manifest V3 extension shell with no streaming-site host permissions.
- Deterministic demo catalog available through the extension options page.
- Title observation + normalization.
- Confidence-aware candidate resolution with explicit `matched`, `ambiguous`, and `unknown` outcomes.
- Fixture-only rating provider.
- Overlay rendering and threshold fading.
- Local settings.
- Per-run receipt counters.
- Node tests for matching/failure invariants.

## What is deliberately not implemented yet

- No Popcorn source/assets/branding.
- No IMDb or Rotten Tomatoes scraping.
- No production rating provider.
- No Netflix/Prime/Disney/Max live content script.
- No claim of parity, browser UAT, production deployment, or store readiness.

## Run the deterministic prototype

1. Open Chrome/Chromium and go to `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this directory.
4. Open the extension details and choose **Extension options** to launch `demo.html`.

The demo intentionally includes an unmatched title to verify that missing evidence does not produce a fabricated score.

## Tests

```bash
node --test test/*.test.js
```

## Next bounded slice

Create the first real platform adapter behind the same contracts, with browser UAT and a fixture/legal metadata provider. Every supported platform is certified independently.
