# Popcorn → Stream Signal reverse-engineering dossier

**Snapshot:** 2026-10-12  
**Coordination issue:** #149  
**Source:** https://www.reddit.com/r/SideProject/s/nIVETWoFUZ  
**Observed product:** https://popcornclub.in/  
**Observed store listing:** https://chromewebstore.google.com/detail/mckbnpnhpbehjmiobhgkhdinejmkmhjd

## Executive decision

Do not clone Popcorn. Rebuild the general product pattern as a clean-room, reliability-first streaming decision layer.

The useful donor behavior is simple and validated by real usage: users want ratings and filtering directly inside streaming catalogs. The better product opportunity is broader:

`streaming card -> title observation -> confidence-bounded canonical match -> licensed metadata/ratings -> local decision rules -> overlay/watch action -> reliability receipt`

The immediate technical wedge is **match quality + adapter resilience + observable failure states**. Public competitor feedback for long-running products in this category repeatedly points to broken site adapters and incorrect mappings as the failure mode that matters most.

## Observed donor behavior

Public product/listing evidence shows:

- Manifest V3 Chrome extension;
- ratings on browse cards and detail/hover contexts where supported;
- IMDb and Rotten Tomatoes score display;
- score-threshold fading;
- configurable chip style/size/source display;
- per-browser local preferences;
- remote title lookup through `popcornclub.in`;
- no fabricated badge when a title cannot be matched;
- current public messaging names Netflix, Prime Video, Hotstar, ZEE5, MX Player, Hulu, Disney+, HBO Max and Apple TV.

The creator reports crossing roughly 100 weekly active users after around two months. The launch notes describe approximately 20 initial users from friends/family, Reddit posts with about 4.1K and 16K views, and continued organic discovery of roughly 1–4 users/day after promotion paused.

## Distribution pattern worth absorbing

The donor's growth notes are as valuable as the UI pattern:

1. distribution is a first-class workstream;
2. audience/community context changes the correct product pitch;
3. organic community experiments should precede large paid spend;
4. a short demo is more effective than prose for visual products;
5. track reach, acquisition and retention separately;
6. campaign-specific landing URLs improve attribution;
7. launch is iterative, not one day.

For our build, distribution becomes a product roadmap lane with evidence and retention cohorts, not an afterthought.

## Clean-room reconstruction model

```text
Streaming Catalog DOM
        |
        v
Platform Adapter
  - card discovery
  - title/year/type observation
  - platform-id observation when available
  - SPA/navigation lifecycle
        |
        v
Canonical Resolver
  - normalization
  - candidate retrieval
  - confidence score
  - matched / ambiguous / unknown
        |
        v
Provider Gateway
  - legal/credentialed providers only
  - cache + negative cache
  - provider attribution metadata
        |
        v
Decision Layer
  - local source selection
  - threshold/fade rules
  - hidden/watched/watchlist state later
        |
        v
Overlay Renderer
  - badges/tooltips/actions
  - accessibility
        |
        +--> adapter health / receipts
        +--> correction feedback
```

This reconstruction is behavior-derived. It is not based on donor bundle/source inspection.

## Data-rights boundary

Ratings/data licensing is a product dependency, not an implementation detail.

- IMDb provides commercial metadata/ratings licensing through its developer program.
- Rotten Tomatoes requires licensing/business approval for app/data integration and its public Terms prohibit unauthorized scraping/data mining.
- TMDB's developer API is free for non-commercial projects with attribution; commercial use requires a commercial license.
- TMDB watch-provider data is supplied via JustWatch and requires attribution.

Therefore the first implementation uses fixture data behind a provider interface. No production path may silently scrape public IMDb/Rotten Tomatoes pages.

## Comparator finding

Trim is a major category comparator with tens of thousands of Chrome users and a broader feature set. Publicly visible review analysis highlights the real category pain:

- breakage after Netflix/Prime site changes;
- region-specific failures;
- missing overlays;
- wrong ratings attached to titles;
- inconsistent behavior across services.

This validates the priority order:

1. adapter resilience;
2. title-match correctness;
3. explicit uncertainty;
4. diagnostics/correction;
5. richer discovery features.

## MATCH / IMPROVE / NEW / OMIT

### MATCH

- card/detail rating overlays;
- threshold fading;
- local preferences;
- lightweight UI;
- Manifest V3;
- no fabricated rating when unmatched.

### IMPROVE

- provider/legal abstraction;
- confidence-aware matching;
- matched/ambiguous/unknown state;
- user correction flow;
- per-platform adapter contracts and fixtures;
- SPA/virtualized-list resilience;
- positive/negative cache policy;
- adapter health receipts;
- privacy-bounded diagnostics;
- accessibility;
- exact-head/browser UAT evidence before support claims.

### NEW

- cross-service watchlist;
- already-watched / not-interested state;
- trailer action;
- advanced genre/year/language/runtime filters;
- weighted composite score;
- cross-service availability;
- friend/household consensus mode;
- tonight shortlist;
- adapter health console and rapid-repair workflow;
- launch/retention analytics tied to acquisition source.

### OMIT / DEFER

- donor branding/assets/source/bundle copying;
- IMDb/RT scraping;
- invasive browsing-history collection;
- unsupported all-platform claims;
- mobile/native build before browser core is certified;
- monetization before provider rights are resolved.

## Contracts

### `stream-platform-adapter/v1`

- platform/version identity;
- host/path applicability;
- card/detail/hover observation strategy;
- title/year/type/platform-id extraction;
- SPA/navigation strategy;
- fixture references;
- health/certification state.

### `stream-title-observation/v1`

- platform/card/page evidence;
- raw title/year/type;
- normalized values;
- stable key;
- candidate references;
- match confidence;
- matched/ambiguous/unknown outcome.

### `stream-rating-record/v1`

- canonical title id;
- provider id;
- value/scale/type;
- fetch/expiry timestamps;
- attribution/link requirements;
- provider config/license revision.

### `stream-overlay-decision/v1`

- observation/resolution identity;
- exact rating inputs;
- local settings/filter policy;
- overlay/fade decision;
- warnings/unknowns.

### `stream-extension-receipt/v1`

- exact extension commit/build;
- adapter/browser revision;
- cards observed/matched/ambiguous/unknown/rendered;
- provider state;
- assertion/UAT result;
- artifact/screenshot reference where applicable.

## Required negative tests

- DOM drift cannot attach a rating to an unrelated card;
- same-title/different-year collisions stay ambiguous without enough evidence;
- movie/series collisions are not silently merged;
- localized-title mismatch remains confidence-bounded;
- provider miss/outage never fabricates a score;
- low-confidence match never renders as certain;
- repeated mutations do not duplicate overlays/listeners;
- virtualized card reuse is detected and re-evaluated;
- SPA route changes trigger bounded re-scan;
- one broken platform adapter cannot break all platforms;
- provider keys never enter page DOM;
- raw browsing history is not sent by default;
- user corrections append evidence rather than rewriting historical receipts.

## Build status

A first bounded implementation slice exists on branch `re/149-stream-signal`:

- MV3 extension shell;
- no streaming-site host permissions;
- deterministic demo catalog;
- title normalization/observation;
- confidence-aware resolution;
- fixture-only rating provider;
- overlay/fade renderer;
- local settings;
- per-run receipt counters;
- deterministic Node tests.

This is intentionally a **RUNNABLE PROTOTYPE SLICE**, not a production extension.

## Roadmap

### P0 — source/evidence

Done first pass: source, listing, site, growth article, comments, comparator and licensing boundaries.

### P1 — reconstruction/specification

Done first pass: architecture, product thesis, contracts, failure tests and clean-room boundary.

### P2 — deterministic extension shell

Implemented on the working branch. Await exact-head CI after PR creation.

### P3 — first real platform adapter

Next candidate: Netflix, but only after capturing a stable legal test fixture and browser-UAT plan. Support is not claimed until UAT receipts exist.

### P4 — provider gateway

Add provider-neutral backend, secrets isolation, cache/rate-limit behavior, license preflight and attribution metadata.

### P5 — multi-platform adapters

Add one adapter at a time, each independently fixture-tested and browser-certified.

### P6 — differentiated product

Corrections, watchlist, trailer actions, advanced filters, composite score and cross-service availability.

### P7 — reliability/observability

Adapter health dashboard, drift detection, error classification, safe diagnostics, retry/backoff and browser matrix.

### P8 — distribution system

Landing/demo, channel-specific campaigns, attribution, retention cohorts, uninstall/error loop and community-safe launch cadence.

### P9 — release certification

Exact-head CI, browser UAT, packaged artifact digest, provider/license preflight, privacy review, store review and production release receipt.

## Tracker truth

`RESEARCHED / RECONSTRUCTED-first-pass / SPECIFIED-initial / BUILDING=bounded-prototype / RUNNABLE=local-unverified-by-browser / PREVIEW=no / UAT=no / PRODUCTION=no / SHIPPED=no`

## Explicit non-claims

No Popcorn source copied. No Popcorn parity. No production ratings provider. No IMDb/Rotten Tomatoes scraping. No live Netflix/Prime adapter yet. No browser UAT yet. No Chrome Web Store submission. No production deployment. No SHIPPED claim.
