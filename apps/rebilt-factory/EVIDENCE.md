# Remake Atlas — evidence + reconstruction record

Captured: 2026-10-11
Source Reddit post: https://www.reddit.com/r/sideprojects/comments/1x2thgm/i_built_a_directory_for_people_to_list_and_find/
Source directory: https://rebilt.xyz
Master tracker: https://github.com/rrahul0904/agent-work-os/issues/118

## Observed directory behavior

- Live catalog reported 22 projects.
- Search is centered on either the remake name or incumbent software being replaced.
- Categories observed: Photo & design, Video & motion, AI studios, Productivity, Developer tools.
- Listing cards expose summary, incumbent alternative, pricing/release cues, creator attribution and links.
- Project detail pages add screenshots, platform/pricing/license information and source/site links where available.
- The directory is manually curated and submissions are reviewed before listing.

## Feedback captured from the Reddit thread

The rebuild treats these as product requirements rather than optional notes:

1. Filter by license type.
2. RSS/feed so users can follow new listings without revisiting manually.
3. Separate project last-release freshness from directory listing-updated freshness.
4. Add a concise “what it replaces well / what it does not yet” fit statement.
5. Add dedicated incumbent-centric pages, e.g. all Photoshop alternatives.

## Product inventory evidence

The homepage delivered a 22-item featured order:

`kri, meetily, karnakpanel, comoji, openscreen, pikimov, capture-studio, photon-studio, pelican, papra, burly, openpencil, rybbit, checkmate, light-studio, premail, spectrum-studio, teable, panelalpha-engine, vector-studio, arcane, handy`

Open-source/source-code links captured directly from project pages include Meetily, OpenScreen, Pelican, Papra, OpenPencil, Rybbit, Checkmate, Teable, PanelAlpha Engine, Arcane and Handy. Known licenses observed directly on REBILT detail pages: Meetily MIT, OpenScreen MIT, Checkmate AGPL-3.0, Teable AGPL-3.0. Other licenses remain unverified until their donor audit completes.

## Reconstruction decision

Do not create 22 unrelated clones. Build a shared portfolio factory with reusable primitives for auth, billing, storage, search, telemetry, evidence receipts, CI/deployment and product-lane state. Each product remains independently deployable and receives its own behavior contracts, negative tests, UAT and hosted verification.

Open-source lanes are **source-assisted candidates only after license audit**. AGPL donors are treated as behavior/reference inputs unless the resulting product deliberately adopts compatible obligations. Closed-source products are clean-room behavior reconstructions from public evidence.

## Shipping gates

`SOURCE → EVIDENCE → WORKFLOWS → CAPABILITY/FAILURE DECOMPOSITION → FEEDBACK/COMPETITION → DONOR/LICENSE AUDIT → PRODUCT BOUNDARY → CONTRACTS/TESTS → IMPLEMENTATION → RUNTIME VERIFICATION → PRODUCT UAT → HOSTED EXACT-SHA VERIFICATION → PRODUCTION CERTIFICATION → TRACKER TRUTH`

No product is SHIPPED merely because code exists or a URL resolves. The UI currently reports zero shipped products on purpose.
