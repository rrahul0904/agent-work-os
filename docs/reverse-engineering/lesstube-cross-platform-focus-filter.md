# LessTube donor → cross-platform intentional-viewing layer + Apple-safe filtering

Status: **RESEARCHED → SPECIFIED (first pass)**  
Implementation: **NOT STARTED / WIP-GATED**  
Tracker ID: **pending collision-free reconciliation**

## Evidence sources

- Reddit intake: https://www.reddit.com/r/IMadeThis/s/av6W83evXb
- Chrome Web Store donor: https://chromewebstore.google.com/detail/lesstube-%E2%80%94-youtube-cleane/oloemmfdfdnempbpiockejbckckjffci
- Apple Safari Extensions: https://developer.apple.com/safari/extensions/
- Apple WWDC25 NetworkExtension URL filtering: https://developer.apple.com/videos/play/wwdc2025/234/
- Apple URL Filter sample/documentation: https://developer.apple.com/documentation/NetworkExtension/filtering-traffic-by-url
- Comparator: Unhook Chrome Web Store listing

## Clean-room boundary

The current donor is CayooDev `LessTube — YouTube Cleaner & Customizer` v1.0.0. The public search performed for this intake did not locate a source repository for this exact extension. Therefore reconstruction is from public behavior only. Do not copy donor source, branding, assets, selectors, private APIs, or implementation details.

There is an older unrelated open-source project also named LessTube (`lessmatter/lesstube`). Treat it only as a comparator. Do not confuse it with the current CayooDev donor.

## Donor reconstruction

Public feature set:

- hide Shorts
- hide recommendations/home clutter
- hide comments/sidebar/end-screen suggestions
- disable hover autoplay
- blur thumbnails
- grayscale mode
- grid/layout/column controls
- element picker
- custom CSS selectors
- import/export settings
- local-first settings/no-account positioning
- Chromium focus

The donor explicitly describes itself as changing the UI around the video rather than replacing the player.

## Competitive implication

A straight clone is not enough. Established extensions such as Unhook already cover distraction removal at meaningful distribution scale. Our differentiation must come from:

1. Apple support: iPhone, iPad, Mac.
2. Safari + Chromium + Firefox from one policy model.
3. Honest system-wide network filtering through public Apple APIs where supported.
4. Selector/adaptor health and automatic recovery from YouTube DOM drift.
5. Extensible site adapters rather than a one-site CSS bundle.
6. Local-first privacy and capability reporting.

## Product thesis

Build a local-first **attention + content-control layer** that makes distracting sites behave according to user policy.

YouTube is the first high-value adapter; the durable product is the policy engine, adapter SDK and Apple filtering layer.

Working codename: **QuietView / Focus Layer**. This is provisional and requires naming/trademark collision review before public release.

## Architecture

### Shared policy core

```text
packages/
  policy-core/
  site-adapters/
    youtube/
  webextension-runtime/
  rule-compiler/
  capability-engine/

apps/
  chromium-extension/
  firefox-extension/
  safari-extension/
  apple-host/
```

The policy core owns feature configuration and host/path exceptions. Site adapters translate semantic behaviors into DOM operations. The rule compiler emits platform-specific browser/network rules. The capability engine reports what each platform can actually do.

### Browser layer

The browser layer owns UI behavior:

- Shorts/feed/recommendation hiding
- comments/live-chat/sidebar/end-screen control
- autoplay/hover policies
- thumbnail and grayscale modes
- layout control
- element picker/custom selectors
- search-only/focus modes
- per-channel/per-route exceptions
- settings import/export
- health probes and kill switch

### Apple host app

A Swift/SwiftUI host for iPhone, iPad and Mac owns:

- onboarding and permissions
- Safari extension enablement guidance
- shared preferences/App Group bridge
- local health dashboard
- `Open Clean` Share Sheet/action
- optional iCloud settings sync only after explicit opt-in
- optional NetworkExtension configuration on supported OS versions

### Apple network layer

On iOS, iPadOS and macOS 26+, evaluate Apple's URL Filter APIs in NetworkExtension for system-wide full-URL filtering. Use public APIs only.

Non-negotiables:

- no TLS MITM
- no root certificate installation
- no private APIs
- no native-app binary patching
- no stealth process injection
- explicit user enablement and visible disable/recovery path
- local/privacy-minimized receipts

For older OS compatibility, DNS-level filtering can block known third-party ad/tracker hosts but cannot reliably distinguish first-party resources that share a hostname with legitimate content.

## Native YouTube app feasibility

Do **not** promise universal native YouTube app ad removal.

We can credibly support:

| Surface | UI cleanup | Network ad/tracker filtering | Confidence |
|---|---|---|---|
| Safari YouTube on iPhone/iPad/Mac | Yes | Yes, subject to rules/platform | High |
| Chromium desktop YouTube | Yes | Yes | High |
| Firefox desktop YouTube | Yes | Yes | High |
| Other third-party native apps | No UI injection | Known separable ad/tracker resources only | Medium / best-effort |
| Native YouTube app | No DOM/UI injection | Some separable resources may be filterable, but in-stream/first-party delivery is not reliably distinguishable | Best-effort / explicitly limited |

Primary Apple workaround for native-app users: **Open Clean** sends a YouTube URL to Safari, where the Safari extension controls the web surface legitimately.

## MATCH

- hide Shorts
- hide recommendation/home feed
- hide comments/sidebar/end screens
- disable hover autoplay
- blur thumbnails
- grayscale
- grid/layout controls
- element picker
- host-scoped custom selectors
- import/export

## IMPROVE

- iPhone/iPad/Mac Safari support
- Firefox support
- shared settings schema across browsers
- SPA navigation-safe adapters
- semantic targets + selector health probes
- graceful degradation after DOM changes
- profile presets: Study, Work, Music, Search-only, Custom
- accessibility and keyboard control
- per-channel/per-route exceptions
- versioned settings migrations
- signed filter-list provenance
- immediate recovery/kill switch

## NEW

- Apple host app
- Share Sheet `Open Clean`
- optional NetworkExtension URL Filter on supported Apple OS releases
- cross-browser policy compiler
- capability matrix (`supported`, `best_effort`, `unsupported`, `requires_user_enablement`)
- site-adapter SDK for additional high-distraction sites
- intentional-session budgets/timers
- `watch this, then exit` mode
- adapter health dashboard
- local privacy receipts/counters
- DOM-drift fixture suite
- signed rule-list release + rollback

## OMIT

- donor branding/assets/code copying
- DRM circumvention
- TLS interception/MITM certificates
- jailbreak-only behavior
- native third-party app modification
- private Apple APIs
- universal ad-block claims
- unnecessary broad host permissions

## Contracts

### `surface-policy/v1`

```json
{
  "site": "youtube",
  "profile": "study",
  "features": {
    "shorts": "hide",
    "homeFeed": "hide",
    "comments": "hide",
    "hoverAutoplay": "disable",
    "thumbnailMode": "blur"
  },
  "exceptions": []
}
```

### `site-adapter/v1`

- host/path scope
- feature implementation version
- semantic targets
- health probes
- SPA navigation hooks
- safe rollback handler

### `network-rule/v1`

- stable rule id
- URL/domain pattern
- resource type
- allow/block action
- provenance/list version
- required platform capability
- breakage-risk annotation

### `capability-matrix/v1`

Each requested behavior resolves to:

- `supported`
- `best_effort`
- `unsupported`
- `requires_user_enablement`
- platform/API reason

### `filter-receipt/v1`

Local receipt only:

- rule id/version
- platform
- action
- timestamp bucket
- raw browsing URL not persisted by default

### `settings-bundle/v1`

- schema version
- profiles
- route/host exceptions
- custom selectors
- network-filter preferences
- explicit sync opt-in

## Failure and safety tests

Required before RUNNABLE/UAT:

1. Global kill switch restores untouched browser/network behavior.
2. Stale selector fails open for the feature; it must not hide unrelated UI.
3. Video player is never hidden/disabled accidentally.
4. Custom selectors are host-scoped and cannot execute arbitrary script.
5. Corrupt settings fall back to last-known-good schema.
6. Invalid network/filter configuration cannot strand device networking.
7. Playback health catches rules that break legitimate media delivery.
8. Unknown first-party resource defaults to allow.
9. Permissions remain least-privilege.
10. Zero optional telemetry/list-update traffic when those features are disabled.
11. Export never includes credentials/cookies.
12. SPA navigation does not duplicate observers/listeners.
13. Adapter drift raises a visible health failure instead of silently damaging the page.

## Verification matrix

Browsers:

- Chrome/Chromium
- Edge/Brave smoke
- Firefox
- Safari macOS
- Safari iPhone
- Safari iPad

Apple:

- iOS 26+
- iPadOS 26+
- macOS 26+
- previous-OS Safari-only compatibility target

YouTube routes:

- `/`
- `/watch`
- `/shorts/*`
- `/results`
- `/feed/subscriptions`
- channel pages
- playlists
- signed in/out
- light/dark
- localized UI

Recovery:

- extension disabled
- all rules disabled
- malformed import
- DOM drift fixture
- NetworkExtension unavailable
- URL-filter backend unavailable
- signed-list rollback

## Shipping contract

Implementation cannot be promoted to BUILDING until this shipping contract is accepted and WIP capacity exists.

Required release artifacts:

- Chromium package
- Firefox package
- Safari extension inside iOS/iPadOS/macOS host app
- optional Apple URL-filter extension if entitlement/review path is confirmed

Required evidence:

- exact commit SHA
- artifact hashes
- browser-install smoke receipts
- real-device/TestFlight receipts
- permissions/manifests
- capability matrix by browser/device
- DOM-drift suite
- playback/non-breakage suite
- privacy/network-off test
- recovery/rollback test
- store metadata checklist
- UAT against exact SHA

`SHIPPED` requires the exact verified artifact to be live/available and rechecked on real Apple devices plus Chromium and Firefox.

## Delivery phases

### Phase 0 — evidence/reconstruction

- finish public behavior/comments/reviews capture
- continue competitor matrix
- capture clean-room UI behavior/screens
- finalize tracker/GitHub dedupe and allocate RE id

### Phase 1 — policy core + Chromium MVP

- schemas/contracts
- fixture harness
- YouTube adapter
- settings/import/export
- recovery mode

### Phase 2 — Firefox + Safari

- shared runtime port
- Apple host shell
- App Group settings bridge
- `Open Clean`

### Phase 3 — Apple network filtering

- OS 26 URL Filter technical spike
- capability reporting
- signed rule-list pipeline
- playback guardrails
- privacy review

### Phase 4 — adapter platform

- adapter SDK
- additional sites
- intentional-session controls

### Phase 5 — certification/stores

- device/browser matrix
- independent verification
- store submissions
- production verification

## Current nonclaims

- Current donor source has not been inspected.
- Universal native YouTube app ad blocking is not claimed.
- App Store approval is not claimed.
- Implementation is not started.
- No RE number is assigned until canonical tracker reconciliation is complete.
