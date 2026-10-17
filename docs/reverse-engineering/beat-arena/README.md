# Beat Arena — governed REA dossier

Status: `DISCOVERY_COMPLETE / REA_WEB_CAPTURE_PENDING / SPEC_READY / BUILD_NOT_STARTED`

## Target identity

Reference target: **Skrtt** (`skrttbeats.com`), surfaced from the Reddit r/sideprojects post "I'm 18 and built a site for beatmakers. Producers from 5 countries have already joined, but growing it is harder than I thought" on 2026-10-13.

Our independent product identity: **Beat Arena** (working name).

Beat Arena is a clean-room reconstruction of the observable product pattern: a recurring discovery/competition network for beatmakers. It must not copy Skrtt source code, branding, logo, copy, visual identity, proprietary assets, private endpoints, or database implementation.

## Canonical roadmap

Source/Target Identity → Evidence & Capability Discovery → REA Investigation → Evidence Ledger → Behavioral Understanding → Clean-room Reconstruction → Product Specification → Improvement → Build → Verify → Replay/Compare → Deploy → Shipping OS Certify.

REA is a governed reverse-engineering provider/capability layer. Agent Work OS remains responsible for authorization, provenance, clean-room boundaries, implementation, verification, replay, deployment, exact-SHA receipts, and shipping certification.

## Current public evidence

### Observed from the live product

- A weekly beat leaderboard is the primary home-page object.
- Beats are ranked and can be filtered by genre, musical key, country, BPM range, and mood tags.
- Producer pages expose profile identity, country, bio, uploaded beats, and historical placements.
- Beat metadata includes title, genre, BPM and musical key; the public terms also identify mood and preview start time as supported metadata.
- Browsing is public; voting and uploading require sign-in.
- Discord is the identity provider. The public policy states that Skrtt requests Discord `identify` data and links producer profiles and votes to the Discord user ID.
- The public policy describes one vote per beat per Discord account per week, with additional network-address rate limiting and fraud detection.
- Uploaded audio and cover-art storage are part of the product.
- Votes reset every Monday while historical placements are retained.
- Reports/moderation, bans, upload validation, bot protection, and rate limiting are documented product behaviors.
- The public privacy policy identifies Cloudflare hosting/database/file storage and Cloudflare Turnstile.

### Observed from the founder's public technical description

The founder publicly described the reference implementation as Next.js on Cloudflare Workers, Cloudflare D1 for data, Cloudflare R2 for files, Three.js for the hero waveform, and GSAP for animation. This is evidence about the reference stack only; it is not a constraint on our implementation.

### Observed product problem

The reference product is solving a real discovery problem: a small producer can upload a beat to a large platform and rapidly disappear beneath newer content. The weekly reset creates recurring opportunity and a reason to revisit the ranking surface.

### Observed user feedback / retention risk

Public Reddit feedback identified a core fairness risk: if the same few producers repeatedly dominate, new or casual producers may stop participating. A suggested mitigation was personal-progress tracking independent of the global board. The founder agreed that this was an interesting direction and said it was not yet built at that time.

### Current evidence limitation

The current session has public-page and public-document evidence, but not a retained REA CDP capture of script/resource/network evidence. REA website observation must therefore remain marked **pending** rather than fabricated. No claim in this dossier treats unobserved server implementation as recovered source.

## REA investigation pack

When REA is available against an authorized local Chrome-family browser, use it only as a passive evidence provider for the public target.

### Scope

Approved origin: `https://skrttbeats.com`

Primary routes:

- `/`
- `/upload`
- representative `/producer/<slug>`
- `/terms`
- `/privacy`

### Capture objectives

1. Record page structure and accessibility tree.
2. Inventory scripts, framework/vendor fingerprints and route candidates.
3. Capture public resource metadata and bounded network observations during ordinary page loads.
4. Capture screenshots for layout comparison only; never copy protected assets into the clean-room build.
5. Inspect public client bundles for route names, data shapes and API-candidate strings only where REA's evidence contract permits it.
6. Preserve unknowns: server-side logic, private secrets, database schema details, fraud rules and moderation heuristics are not considered known unless publicly observable.

### Required REA output

- target digest / observation timestamp;
- observed origin and routes;
- script/resource inventory;
- framework/vendor evidence;
- endpoint candidates with confidence;
- public data-shape candidates with confidence;
- screenshots as comparison evidence;
- limitations and redactions;
- retained evidence references suitable for replay.

## Capability matrix

| Capability | Decision | Beat Arena direction |
|---|---|---|
| Recurring weekly leaderboard | MATCH | Season object with deterministic weekly boundaries |
| Country leaderboard | MATCH | Country scope derived from producer profile, user-editable with abuse controls |
| Genre leaderboard | MATCH | Controlled taxonomy plus optional subgenre tags |
| BPM/key/mood filtering | MATCH | Indexed metadata facets |
| Audio upload and streaming preview | MATCH | Object storage + signed upload + CDN delivery |
| Cover-art upload | MATCH | Validated images + transformed thumbnails |
| Producer profiles | MATCH | Public profile, bio, links, upload history, placements |
| Historical placements | MATCH | Immutable season result snapshots |
| Discord sign-in | ADAPT | Support Discord plus email/passkey and optional Google/Apple later |
| One vote per beat per account per week | MATCH | Database uniqueness constraint, not client-only state |
| IP/network rate limiting | MATCH | Abuse signal, never sole identity |
| Captcha/bot protection | MATCH | Risk-based challenge on upload/vote spikes |
| Reporting/moderation | MATCH | Report queue + evidence + action/appeal log |
| Weekly beat battles | IMPROVE | Structured head-to-head tournament mode |
| Personal progress | NEW | Rank trend, percentile, best finish, vote delta, streaks |
| Fairness for newcomers | NEW | Rookie board + discovery rotation + exposure-normalized metrics |
| Collaboration discovery | NEW | "Open to vocals", "open to collab", artist/producer matching |
| External licensing link | NEW | Producer-owned outbound licensing/contact links; no marketplace in v1 |
| Social sharing | NEW | Share cards for wins, battles, rank movement and weekly recap |
| Notifications | NEW | Weekly reset, battle challenge, placement, comment/follow alerts |
| AI-generated music detection | DEFER | High false-positive/legal risk; do not gate v1 on unverifiable detection |
| On-platform beat licensing marketplace | DEFER | Adds payments, tax, licensing, dispute and rights complexity |

## Product thesis

A plain leaderboard is not enough. The differentiated product should be a **competitive discovery network for producers** where every week creates fresh opportunity, every producer has a personal progression path, and discovery does not collapse into a permanent popularity contest.

The core loop is:

`Upload → enter weekly season → receive qualified listens/votes → move in scoped boards → battle/collaborate → season closes → placement/progress saved → share result → next season begins.`

The second loop is creator growth:

`Profile → followers → historical progress → challenges → collaboration requests → outbound licensing/contact opportunity.`

## Fair ranking design

Raw vote count is easy to understand but can produce popularity lock-in and coordinated-vote abuse. Beat Arena should expose raw votes while using a separate ranking score.

Recommended v1 score components:

- verified unique votes;
- qualified listen threshold before vote is eligible;
- Wilson/Bayesian confidence adjustment for low-volume entries;
- fraud-weight reduction for correlated voting clusters;
- exposure normalization so early uploads do not permanently dominate;
- freshness/season-only scope;
- optional genre/country board eligibility.

Do not hide the ranking system behind an unexplained black box. Publish a plain-language ranking policy and show why a beat moved.

## Newcomer and retention mechanics

1. **Rookie board** — producer's first four active seasons.
2. **Personal best** — best weekly finish and percentile.
3. **Momentum** — week-over-week rank and vote-quality movement.
4. **Streaks** — consecutive seasons entered or improving.
5. **Head-to-head battles** — opt-in bracket or challenge mode with clear start/end times.
6. **Discovery rotation** — bounded surface that gives eligible low-exposure beats a chance to be heard.
7. **Weekly recap** — personal result card and recommendations for next week.
8. **Genre rooms** — focused community surfaces rather than only global competition.
9. **Critique mode** — optional structured feedback with tags such as drums, mix, arrangement and melody.
10. **Collaboration intent** — vocalists/producers can state what they are looking for.

## Abuse and trust model

Threats:

- multi-account voting;
- Discord/account farms;
- coordinated vote rings;
- automated voting;
- repeated upload spam;
- copyrighted/stolen beats;
- malicious file uploads;
- brigading/reports abuse;
- producer impersonation;
- metadata gaming.

Controls:

- database uniqueness on `(season_id, voter_id, beat_id)`;
- account-age/risk signals without making them the sole eligibility rule;
- per-account, per-network and per-device-class rate limits;
- signed object uploads and MIME/magic-byte validation;
- audio duration/size constraints and asynchronous media processing;
- Turnstile or equivalent bot challenge at risk thresholds;
- anomaly detection on vote timing and voter overlap;
- reversible quarantine of suspicious votes rather than silent destructive deletion;
- moderator action log and user appeal path;
- DMCA/copyright reporting process appropriate to deployment jurisdiction;
- auditable season finalization job.

## Proposed architecture

### Recommended production stack

- **Web:** Next.js / React + TypeScript.
- **API:** Next.js route handlers or dedicated TypeScript service.
- **Primary data:** PostgreSQL (Supabase/Neon are both acceptable provider targets).
- **Auth:** Auth.js or provider-native auth with Discord first; passkeys/email can be added without rewriting ownership semantics.
- **Object storage:** S3-compatible bucket (Cloudflare R2, Supabase Storage or AWS S3).
- **Media:** asynchronous worker using FFmpeg for validation, waveform peaks and preview derivatives.
- **Rate limiting:** Redis-compatible store or edge limiter.
- **Jobs:** durable scheduler/queue for season close, media processing, notification fan-out and moderation checks.
- **CDN:** edge caching for public audio previews and artwork.
- **Observability:** structured logs, request correlation IDs, error tracking, season-close audit receipts.
- **Deployment:** Vercel/Cloudflare/Railway depending final provider lane; Shipping OS owns final release truth.

### Logical services

`Web UI → Auth → API → Postgres`

`Upload API → signed URL → Object Storage → Media Worker → derived preview/waveform → Beat record READY`

`Vote API → auth/rate-limit/risk checks → vote ledger → ranking materialization`

`Season Closer → freeze eligibility → compute final ranks → persist placement snapshot → reset active ranking → emit notifications/receipt`

`Moderation → reports → evidence queue → action/appeal log`

## Core data model

### User

- `id`
- `auth_provider`
- `provider_subject`
- `created_at`
- `status`
- `risk_state`

### ProducerProfile

- `id`
- `user_id`
- `slug`
- `display_name`
- `country_code`
- `bio`
- `avatar_url`
- `contact_url`
- `collab_status`
- `created_at`

### Beat

- `id`
- `producer_id`
- `title`
- `genre_id`
- `subgenre_tags`
- `bpm`
- `musical_key`
- `mood_tags`
- `audio_object_key`
- `preview_object_key`
- `cover_object_key`
- `waveform_peaks`
- `duration_ms`
- `status`
- `created_at`

### Season

- `id`
- `starts_at`
- `ends_at`
- `status`
- `finalized_at`
- `finalization_receipt_digest`

### SeasonEntry

- `id`
- `season_id`
- `beat_id`
- `entered_at`
- `eligibility_state`
- `exposure_count`
- `qualified_listens`
- `raw_vote_count`
- `ranking_score`

### Vote

- `id`
- `season_id`
- `beat_id`
- `voter_user_id`
- `qualified_listen_id`
- `risk_weight`
- `created_at`

Unique constraint: `(season_id, beat_id, voter_user_id)`.

### Placement

- `season_id`
- `beat_id`
- `board_type`
- `board_value`
- `rank`
- `final_score`
- `raw_votes`

### Battle

- `id`
- `season_id`
- `challenger_entry_id`
- `opponent_entry_id`
- `starts_at`
- `ends_at`
- `status`
- `winner_entry_id`

### Report / ModerationAction / Appeal

Separate immutable records so moderation decisions are reviewable and auditable.

## API surface — v1

Public reads:

- `GET /api/seasons/current`
- `GET /api/leaderboard`
- `GET /api/beats/:id`
- `GET /api/producers/:slug`
- `GET /api/producers/:slug/placements`

Authenticated writes:

- `POST /api/uploads/sign`
- `POST /api/beats`
- `PATCH /api/beats/:id`
- `DELETE /api/beats/:id`
- `POST /api/beats/:id/votes`
- `DELETE /api/beats/:id/votes/current`
- `POST /api/beats/:id/reports`
- `POST /api/battles`
- `POST /api/battles/:id/votes`
- `PATCH /api/profile`

Internal jobs:

- `POST /internal/media/process`
- `POST /internal/seasons/finalize`
- `POST /internal/rankings/rebuild`
- `POST /internal/notifications/fanout`

## Functional build slices

### Slice 0 — evidence and contracts

- finish REA CDP evidence capture;
- freeze clean-room capability matrix;
- define ranking policy and season boundary contract;
- define media validation limits;
- define abuse policy and moderation lifecycle.

### Slice 1 — usable MVP

- auth;
- producer profile;
- signed audio/artwork upload;
- media processing;
- weekly season entry;
- browse/filter/play;
- vote/unvote;
- leaderboard;
- producer history;
- deterministic Monday close job.

### Slice 2 — retention differentiation

- personal progress dashboard;
- rookie board;
- weekly recap;
- follow producers;
- notifications;
- share cards.

### Slice 3 — competition/community

- beat battles;
- critique mode;
- genre rooms;
- collaboration intent and requests.

### Slice 4 — monetization

Only after retention and abuse controls are proven.

Candidate paid value:

- Pro producer analytics;
- advanced profile customization;
- private feedback rooms;
- battle/event hosting tools;
- optional verified-producer program;
- promoted discovery inventory that is **visibly separated from organic rankings**.

Never sell hidden ranking manipulation. Paid placement must not masquerade as an organic leaderboard win.

## Verification contract

### Functional

- anonymous users can browse and play public previews;
- authenticated producer can create/edit profile;
- valid audio upload reaches READY state through asynchronous processing;
- invalid MIME/magic-byte mismatch is rejected;
- one account cannot vote twice for the same beat in the same season;
- weekly season closes deterministically and historical placements remain queryable;
- country/genre/BPM/key/mood filters return consistent subsets;
- producer page matches uploaded beats and placement history;
- battle state cannot accept votes outside its active interval;
- report and moderation lifecycle is auditable.

### Security

- no object-storage write is possible without bounded signed authorization;
- no raw storage credentials or auth secrets appear in client bundles;
- uploads enforce type, duration and size policy;
- rate-limit failure is fail-closed for vote/upload abuse paths;
- authorization prevents editing/deleting another producer's content;
- season-finalization endpoint is not public;
- vote uniqueness is database enforced;
- moderation/admin operations require explicit privileged role.

### Ranking integrity

- ranking rebuild from the immutable vote ledger is deterministic;
- season result snapshot is immutable after finalization except through an auditable correction workflow;
- suspicious-vote adjustments retain before/after evidence;
- identical input ledger produces identical rank output.

### Shipping

- isolated branch/worktree;
- deterministic tests green;
- preview deployment reachable over HTTPS;
- browser UAT passes the upload → play → vote → leaderboard → season-history golden path;
- production deploy corresponds to tested SHA;
- production UAT repeats the critical golden path;
- Shipping OS emits `SHIPPED` only after all mandatory gates pass.

## Replay / comparison plan

Do not compare source code. Compare only observable capability and our documented product requirements.

Reference comparison set:

- home leaderboard information architecture;
- filter coverage;
- producer-page information coverage;
- upload metadata coverage;
- weekly reset behavior;
- auth requirement for upload/vote;
- vote uniqueness semantics;
- historical placement persistence.

Beat Arena is allowed and expected to differ in branding, layout, animations, copy, ranking algorithm, data model, auth providers, infrastructure and all implementation details.

## Clean-room boundary

Allowed inputs:

- public product behavior;
- public website content;
- public founder descriptions;
- public Reddit feedback;
- open web standards and public vendor documentation;
- independently authored implementation.

Forbidden inputs:

- copied donor source code;
- private API access;
- leaked credentials or private data;
- copied branding/logo/illustrations;
- copied proprietary copy or exact visual composition;
- bypassing authentication or security controls;
- destructive or intrusive testing of the reference service.

## Product rating

- Problem strength: **4.3/5** — discovery pain is easy to understand and recurring.
- Build feasibility: **4.6/5** — technically straightforward; abuse/fairness is the hard part.
- Monetization potential: **3.8/5** — creator subscriptions and events are plausible but require engagement density first.
- Differentiation potential: **4.5/5** if we build progress, battles, critique and collaboration rather than clone a leaderboard.
- Network-effect risk: **high** — an empty leaderboard is not a product; launch must seed genre communities deliberately.
- Legal/rights risk: **medium-high** — user-uploaded music requires copyright/reporting processes and clear rights representations.
- Overall portfolio score: **4.2/5**.

## Go / no-go decision

**GO**, but not as a literal Skrtt clone.

The clone-equivalent surface is small and easy to reproduce. The investable opportunity is a broader producer competition + growth network with fairness controls, progress mechanics, beat battles, critique, collaboration and creator analytics.

## Immediate next actions

1. Run retained REA browser evidence capture against the public target when the authorized REA browser lane is available.
2. Create Beat Arena as a separate product repository rather than coupling production code to Agent Work OS.
3. Implement Slice 1 behind a local/dev environment with synthetic beats first.
4. Add deterministic season-finalization and ranking-integrity tests before inviting real creators.
5. Add media and copyright/moderation controls before public upload access.
6. Gate deployment through Shipping OS; no production `SHIPPED` claim without exact-SHA deployment receipts and production UAT.
