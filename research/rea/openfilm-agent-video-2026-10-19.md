# REA — OpenFilm → Agent Film Studio

**Captured**: 2026-10-19 | **Classification**: DONOR / EXTENSION | **Status**: BUILD FIRST SLICE, UNMERGED, NOT SHIPPED

## Source identity
- User intake: https://www.reddit.com/r/BuildWithClaude/s/rCz9p1kUA5
- Resolved Reddit: https://www.reddit.com/r/BuildWithClaude/comments/1x9h0kx/
- Public product: https://openfilm.dev/
- Upstream code: https://github.com/openfilm/openfilm
- Inspected upstream main SHA: `120193c63329c61ae2863dd681f6c5ed31b5a9bf` (2026-10-18)
- License: root MIT, © 2026 OpenFilm contributors; name and marks reserved, third-party provider/media obligations separate.
- Governance issue: https://github.com/rrahul0904/agent-work-os/issues/303
- Implementation: https://github.com/rrahul0904/faceless-content-creator/pull/36

## Observed workflow
1. Coding agent receives a movie prompt, writes a film document and scene web pages.
2. A scene exposes a deterministic time-addressable rendering function; the timeline cuts together page, video, image and audio tracks.
3. Operator inspects frames/contact sheets in the local Studio; click to edit/tweak layers and timeline; overrides survive agent updates.
4. CLI/server/desktop renders exports with local browser/FFmpeg support.
5. Optional external providers generate voice/images/music/video using user-supplied keys.

**Distinguish observed from claims**: exact-frame rendering and extensive export/agent support are documented upstream, but not reproduced in the owned implementation. Multicam/raw interchange was raised in Reddit comments; not verified as supported.

## Owned product boundary
- `rrahul0904/faceless-content-creator` owns the media generation, editor, render/export, and publishing product.
- `rrahul0904/agent-work-os` owns REA research evidence, traceable execution/proof and governed agent/deployment integration.
- Do not spin up a new standalone video repo without independent product-boundary evidence. Reuse the existing editor/render/tenant primitives.

## Capability table
| Capability | Public donor | Owned baseline | Implementation / gate |
| --- | --- | --- | --- |
| Agent-authored timeline | film.html tracks/pages | JSON template engine + motion plan | FilmPlan v1 declarative adapter in PR #36 |
| Interactive editing | Studio direct overrides | Template Studio position/text/styles | Existing Studio + /film storyboard, advanced override parity TBD |
| Local video export | Chromium + FFmpeg | FFmpeg MP4 + subtitles + local TTS | Existing render path; FilmPlan-specific MP4 UAT pending |
| Media sources | user-owned asset folder + providers | workspace media uploads, AI presenter | Owned/validated resolution before new film media support |
| Runtime determinism | frame(t) plus shuffled verification | bounded FFmpeg scene render | SHA fingerprint, time-range validation; frame-parity checks missing |
| Security | local folder workflow | multi-tenant auth + usage accounting | No user-authored scripts/remote media URL acceptance in FilmPlan v1 |
| Agent interface | CLI commands + skill | external agent orchestration planned | JSON/API first, skill/CLI agent adapters pending |
| Shipping | app downloads | SaaS/Docker base | draft PR, CI/production certification pending |

## REA phase evidence
- SOURCE: resolved Reddit and upstream.
- ANALYSIS: pinned main commit and upstream specification `packages/openfilm/SPEC.md`; reviewed owned creator template/video machinery.
- ROUTING: donor/extension; no new repo; governance issue #303.
- DESIGN: FilmPlan v1 normalized scenes and timed text/shape layers, local narrator, structural guardrails.
- IMPLEMENTATION: draft product PR #36.
- VERIFY: check unit, API smoke, lint/types/build and real encoded film before changing status. At intake, CI security audit reported 3 advisories (Next.js critical, sharp high, source-map-js high). This is a release blocker. No deployment proof.
- SHIP: not authorized; no production claim.

## Roadmap continuation
P0: rectify dependency advisories, certify FilmPlan-to-MP4 end-to-end with media receipt; finish scene edit/preview UAT.
P1: workspace-owned media clip resolution, audio timeline, visual selection, inspector overrides, real seek/scrub.
P2: safe preview/exact-frame determinism and snapshot diff; independent agent CLI adapters, provider budget gates; export interchange.
P3: desktop packaging, mobile review, social scheduling approvals; exact commit-SHA hosted release gates and recovery receipts.

## Clean-room boundary
No OpenFilm source code or UI/trademark copied to the product. Keep attribution/evidence for source inspiration. External media credits/licenses and any third-party plugin licenses must be verified before integration. Reject arbitrary generated HTML/scripts in hosted request path until sandbox isolation, resource/network policies, and provenance are implemented.
