# Gary HQ Village → Spatial Agent Room donor dossier

Issue: #100

Status: `RESEARCHED / SPECIFIED / BLOCKED_WIP`

This dossier records an evidence-first clean-room intake of the user-supplied GaryStow village dashboard concept. It is a capability donor for Agent Work OS / Agent Room, not a request to clone the donor application or create another repository.

## Source manifest

| Source | Role | Intake result |
| --- | --- | --- |
| `https://www.reddit.com/r/sideprojects/s/976bnjV8nD` | supplied launch | resolved and reviewed |
| `https://garystow.co.uk/village/` | first-party live village | reviewed |
| `https://garystow.co.uk/articles/how-to-build-a-live-village-dashboard-for-your-ai-agents/` | first-party build guide | reviewed |
| `https://github.com/GarySto/village-starter` | public reference repo | reviewed; MIT |
| supplied Reddit comments | user feedback | no substantive independent comment bodies exposed at intake snapshot |

Do not infer private implementation details that are not visible in these sources.

## Product problem reconstructed

Operational agent systems quickly become difficult to understand through logs, tables and terminal streams alone. The donor makes the system legible to a non-specialist by translating real operational facts into a spatial world:

- work areas become districts;
- durable assets/results become buildings or fields;
- active work becomes moving actors and paths;
- pending human decisions become a Town Hall queue;
- simple bounded metrics affect visual geometry;
- the renderer consumes a projection instead of talking directly to the automations.

The valuable idea is not the cartoon aesthetic. It is **a spatial, read-only projection of operational truth with an explicit human-attention location**.

## Evidence table

| Observation | Evidence label | Product implication |
| --- | --- | --- |
| Python + Flask + one HTML Canvas are sufficient for the donor | DOCUMENTED | no game engine is required for the first spatial view |
| activity is appended as events and transformed into a JSON village data file | DOCUMENTED | preserve a projection boundary between runtime truth and presentation |
| rendering is isolated from automations | DOCUMENTED | renderer must never become execution authority |
| start / finish / fail / wait-for-human are important visualization events | DOCUMENTED | these map well to Agent Work OS normalized status/attention events |
| human decisions gather at Town Hall | OBSERVED / DOCUMENTED | use a dedicated attention queue rather than hiding approval stalls in logs |
| teams/departments occupy separate areas | OBSERVED | spatial grouping may reflect known namespaces only; never invent topology |
| page traffic changes house size and strategy results change fields | DOCUMENTED | metric-to-geometry policies must be bounded, clamped and provenance-bearing |
| label overlap appeared as the scene grew | DOCUMENTED | semantic zoom and dense-scene aggregation are acceptance requirements |
| misleading path geography was corrected by separating work domains | DOCUMENTED | presentation must not imply causal/team relationships absent source evidence |
| public and private data are produced separately | DOCUMENTED | any future share mode requires a separate redacted projection |
| the public reference is MIT licensed | DOCUMENTED | behavior may inform clean-room design; donor assets/branding still remain excluded |
| independent Reddit feedback | UNKNOWN at snapshot | do not invent community requirements; refresh if material feedback appears |

## Existing canonical destination

Do not create a new repository.

Canonical destination: `rrahul0904/agent-work-os`

Related active work:

- Issue #95 — Agent Room multi-agent observability
- Draft PR #96 — Agent Room Phase A

Agent Work OS already owns the facts this view needs: authenticated local executors, normalized machine/session/events, durable state, `/api/state`, WebSocket updates and the Shipping Console. A new village service would duplicate authority and create synchronization drift.

## Product thesis

Add an optional **Village View** / **Spatial View** to Agent Room:

```text
agent adapters / echo / future transcript adapters
                    |
             normalized runtime truth
                    |
          Agent Work OS state + events
                    |
          spatial-scene/v1 projector
        deterministic, side-effect free
                    |
     +--------------+--------------+
     |                             |
Agent Room cards              Village View
operational detail       spatial fleet overview
```

Both views must render the same canonical facts. Neither view may create a second work/session database.

## Reconstructed golden path

1. Receive a canonical Agent Work OS state snapshot.
2. Validate the snapshot and preserve explicit unknown/stale state.
3. Group only by known machine/repository/team metadata.
4. Project sessions into actors and known namespaces into districts/structures.
5. Project explicit work/status events into bounded activity cues.
6. Project verified approval/error/wait events into the attention/Town Hall queue.
7. Apply optional metric-to-geometry mappings only through declared policies with clamp/source/timestamp metadata.
8. Compute a deterministic canonical scene digest.
9. Render the scene without network/model/filesystem/execution side effects.
10. Replay changes only the presentation cursor; it never mutates the underlying session.

## MATCH / IMPROVE / NEW / OMIT

### MATCH

- understandable-at-a-glance world view;
- animated activity from real events;
- separate areas for known work domains;
- explicit human-attention location;
- simple Canvas rendering;
- inspectable history/replay;
- future private/public separation.

### IMPROVE

- render `working / waiting / blocked / done / unknown` explicitly as well as metaphorically;
- retain source IDs, timestamps and evidence provenance in inspectable details;
- prioritize blocked/approval-needed work;
- support many repositories and machines, not donor-specific SEO/trading workflows;
- deterministic projection/digest rather than ad hoc scene construction;
- semantic zoom, aggregation and readable dense-scene behavior;
- keyboard navigation, high contrast, reduced motion and phone-width UAT;
- stale/unknown facts remain visibly stale/unknown.

### NEW

- `spatial-scene/v1` contract;
- a view selector over one canonical Agent Room truth model;
- deterministic scene receipts;
- evidence-bound attention/Town Hall objects;
- bounded metric presentation policies;
- a deliberate no-inferred-edge rule for spatial topology.

### OMIT / DEFER

- donor name, copy, characters, art, CSS, building designs or page layout;
- SEO/trading-specific semantics;
- public hosting/share mode in the first slice;
- approval/execution controls inside Canvas in the first slice;
- generated parent/sub-agent hierarchy without explicit evidence;
- any model call solely for rendering;
- a game engine until measured Canvas limitations justify it;
- production deployment before independent evidence gates.

## Behavioral contracts

1. **Single authority** — the spatial view consumes canonical Agent Work OS facts; it never owns session/work state.
2. **Read-only rendering** — projection and render paths cannot start, stop, approve, interrupt, edit or deploy work.
3. **Deterministic scene** — equivalent canonical input must produce the same normalized `spatial-scene/v1` content and digest.
4. **Unknown stays unknown** — absent machine/team/topology/metric information is never guessed for visual neatness.
5. **No inferred causal edges** — spatial proximity and animation may not assert delegation or causal relationships not present in source facts.
6. **Attention requires evidence** — Town Hall entries require an underlying approval/error/wait signal and retain its source identity.
7. **Metric mapping is presentation** — size/health/height mappings are bounded and clamped and preserve source, timestamp and policy ID.
8. **Stale is visible** — stale actors/metrics are marked stale; old evidence cannot masquerade as current activity.
9. **Replay is immutable** — changing the replay cursor affects only display state.
10. **Renderer isolation** — malformed scene/render failures cannot mutate or interrupt agent execution.
11. **Private by default** — scene details remain private unless a separately generated public/redacted projection is explicitly requested.
12. **Public projection is separate** — future public mode must be generated from an allowlisted redaction contract, never by hiding fields after private DOM/render creation.

## Security / privacy boundary

Phase A projector/renderer must not:

- scan arbitrary filesystem locations;
- resolve symlinks or read repositories directly;
- receive raw credentials/secrets;
- call external APIs or models;
- execute shell commands;
- infer sensitive details from paths for public display;
- publish a public artifact;
- authorize agent or deployment actions.

If canonical events contain secret-shaped payloads, the view should display a safe omission marker rather than the value.

## Failure modes to test

- malformed canonical input;
- missing machine/repository metadata;
- stale status with recent/old events;
- contradictory status and error evidence;
- attention event without an approver identity;
- huge or negative metric values;
- unknown metric provenance;
- duplicate event IDs;
- replay cursor before/after available history;
- dense scene with many labels;
- reduced-motion preference;
- renderer failure during active work;
- attempted causal edge without a canonical source relation;
- attempted public projection containing non-allowlisted detail.

## Phase A Shipping Contract

Implementation is intentionally blocked until the current Agent Room base is verified or this donor is explicitly folded into the same bounded release.

When the WIP gate opens, Phase A is limited to:

1. pure `SpatialScene` projector over synthetic/normalized Agent Room state;
2. canonical serialization + SHA-256 scene digest;
3. districts, structures, actors, attention queue and evidence-backed activity edges;
4. declared metric presentation policy with bounded clamps;
5. read-only Canvas demo behind an Agent Room view switch;
6. deterministic positive/negative tests;
7. no network/filesystem/model/agent/deployment side effects.

Machine-readable contract: `contracts/spatial-agent-room-view.phase-a.json`.

## Verification gates

No promotion claim until all applicable gates pass on the exact head:

1. focused projection/contract tests;
2. repository `npm test`;
3. repository `npm run acceptance`;
4. exact-head GitHub Actions;
5. browser UAT in deterministic demo mode;
6. browser UAT against a live normalized Agent Work OS session;
7. desktop + phone-width layout;
8. keyboard navigation;
9. reduced-motion behavior;
10. dense-session/label stress;
11. renderer-failure isolation check;
12. preview deployment + deployment/SHA receipt if promoted;
13. independent review before any production claim.

## WIP and dependency gate

Draft PR #96 is already the active Agent Room implementation lane. This donor remains `BLOCKED_WIP` until one of these is true:

- #96 completes its exact-head tests, CI and browser UAT, then Village View is layered onto that verified model; or
- the Shipping Supervisor explicitly reclassifies this work as a bounded dependency of #96 without creating a second canonical state model.

## Tracker rule

Do not allocate an `RE-` number from this branch. The Library tracker was reconciled through RE-394 at intake time and same-day work is concurrent. Assign the donor ID only during collision-free tracker reconciliation.

## Current truth

Research and specification are complete enough to preserve requirements without rediscovery.

No Village View implementation, browser UAT, preview, public export, production deployment, parity or `SHIPPED` state is claimed.