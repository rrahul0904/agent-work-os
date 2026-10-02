# RE-371 — SpotMyMap-inspired Operations Atlas

## Research date

2026-10-01.

## Intake

User-supplied Reddit launch:

- https://www.reddit.com/r/SideProject/comments/1w8mibh/my_weird_little_corner_of_the_internet/

Primary public product surfaces reviewed:

- https://spotmymap.com/
- https://spotmymap.com/how-it-works
- https://spotmymap.com/leaderboard
- https://spotmymap.com/explore
- https://spotmymap.com/money-map
- https://spotmymap.com/claim
- https://spotmymap.com/about

This is a clean-room behavioral/interaction study. No SpotMyMap source, assets, branding, protected copy, or private implementation is used.

## What the public product demonstrates

The transferable pattern is not the advertising/payment business itself. It is the way a dense changing system is made explorable:

1. **A living spatial overview.** The main surface is not a conventional table. Participants occupy visible map space and the presentation changes as underlying activity changes.
2. **Overview -> filter -> drill-down.** Users can filter categories, select a country/placement and move from global context to one entity.
3. **Recent arrivals.** New activity is surfaced as a compact feed instead of forcing the user to inspect every region.
4. **Leaderboard.** Separate ranking views make high-activity/high-value entities easy to locate.
5. **History as a product dimension.** The public product records changes and makes the evolution of the map part of the experience.
6. **Explicit rules.** The product repeatedly explains what the area/placement means and what it does not mean.
7. **Playfulness without hiding the core loop.** The launch explicitly invites exploration, clicking and dragging.

## Reddit feedback considered

Accessible feedback on the supplied thread is sparse.

- One commenter grouped the experience with pixel-art / outbid-style projects. This reinforces the need for an original Agent Work OS implementation rather than a literal visual clone.
- Another commenter said the project was fun precisely because it was a weird little thing and not pretending to solve an enormous problem. For our admin surface, the useful lesson is that a control plane can be memorable and exploratory without sacrificing truthful operational labels.

No substantial independent feature-request thread was accessible. None is invented.

## Existing Agent Work OS fit

Agent Work OS already owns:

- the authenticated browser control plane;
- persistent machine/session state;
- normalized real-time WebSocket events;
- session start, follow-up and interrupt;
- local agent capabilities;
- RE-297 decision memory/handoff;
- RE-370 multi-provider/shared-Brain controls.

Therefore RE-371 is a **presentation and navigation layer over existing facts**, not a second state store and not a new standalone product.

## Original translation: Operations Atlas

The admin dashboard maps SpotMyMap-like interaction ideas into an original operational model:

| Public interaction idea | Agent Work OS implementation |
| --- | --- |
| map regions | workspace territories derived from session cwd |
| changing visible share | bounded card emphasis from raw session/event/message counts |
| category filters | status + agent filters and search |
| live arrivals | recent normalized session events |
| leaderboard | workspaces sorted by raw event/message counts |
| history | recent-change stream over observed events |
| placement drill-down | workspace territory -> existing session desk |
| clear product rules | explicit copy stating that emphasis is not a productivity score |

No fabricated quality, productivity, cost, or performance score is introduced.

## Phase A implementation

Branch: `feat/re371-operations-atlas`

Stacked on the exact RE-370 head `12076868689c109d61a63f02a4e6ebbf99260b34` so the Brain handoff controls remain present.

Implemented:

- Operations Atlas as the default operator view;
- online machine / active session / total session / observed event metrics;
- deterministic workspace aggregation from current WebSocket session state;
- workspace territory mosaic;
- status, agent and text filtering;
- recent activity/arrivals feed;
- activity board using explicit raw counts;
- recent-change stream;
- territory/feed/list click-through to the existing session desk;
- responsive desktop/tablet/mobile layout;
- existing RE-370 Brain handoff, verified-context, follow-up and interrupt controls preserved;
- static syntax/feature tests for the browser bundle.

## Evidence boundary

Phase A uses existing control-plane facts only. It does not add:

- geographic mapping;
- payments, public placements or charity mechanics;
- a new backend state model;
- an inferred productivity score;
- deployment;
- production-hardening or production-readiness claims.

## Next verification gates

Before calling this UI certified:

1. GitHub Actions must pass on the exact branch head.
2. Run a real local control plane + daemon with multiple workspaces and agents.
3. Verify layout and interaction at desktop and mobile viewport widths.
4. Verify that live WebSocket updates do not interrupt form entry beyond the existing render model.
5. Add richer history only when trustworthy timestamps/order receipts exist.
