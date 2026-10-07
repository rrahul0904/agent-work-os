# Vibecoded Apps: 50-project reverse-engineering intake

Status: Phase A / evidence and boundary reconstruction  
Source issue: #64  
Intake date: 2026-10-07

## Source and evidence

The supplied Reddit post points to `vibecodedapps.dev`, whose public source inventory is `levz0r/awesome-vibecoded-apps`.

Observed first-party/public facts at intake:

- the catalog exposes 50 entries;
- the catalog reports that all 50 were live at its 2026-10-05 check;
- incoming entries are checked for a minimum age, a public statement about AI involvement, and evidence that other people use the product;
- a scheduled link checker runs weekly and opens/updates an issue when links fail;
- the site is generated from the source inventory rather than maintained as a second handwritten catalog.

The useful donor pattern for Agent Work OS is therefore **evidence-gated source intake plus freshness certification**, not the visual directory.

## Clean-room boundary

This work extracts product behavior and operational patterns from public evidence. We do not copy donor branding, protected assets, private APIs, or source implementations into Agent Work OS. Open-source repositories may be read to understand contracts and failure modes, but implementation here must use our own data model and code organization.

## Captured inventory (50/50)

| # | Donor | Reconstructed user outcome | Initial disposition |
|---:|---|---|---|
| 1 | Aldi Prices | Observe grocery price history | Capture; commerce/price intelligence family |
| 2 | ASCIIKeyboard | Turn typed text into ASCII art on macOS | Capture; desktop utility |
| 3 | Babel Life | Browse bilingual generated life narratives | Capture; generative storytelling family |
| 4 | Beatseek | Search music across services in one place | Capture; federated media discovery |
| 5 | bidboard.games | Rank game sites through paid bids | Capture; marketplace/directory mechanic |
| 6 | Bitchat | Message nearby peers without internet using Bluetooth mesh | Reconcile with existing remote/offline transport work |
| 7 | braincell.lol | Teach a constrained AI only paid-for facts | Capture; experimental knowledge/economy mechanic |
| 8 | CarbScan | Estimate carbohydrates from an image | Capture; image-to-structured-inference family |
| 9 | claude-code-statusline | See coding-agent session/token/cost state at a glance | **P0 Agent Work OS donor** |
| 10 | Context | Test and debug MCP servers from a native macOS client | **P0 Agent Work OS donor** |
| 11 | CourtSync Calendar | Extract scheduling dates/deadlines from court PDFs | P1 document-to-action workflow donor |
| 12 | Cowboy Shooter | Play a 3D runner/shooter | Game portfolio reconciliation |
| 13 | Crashy Zorg | Play an Android arcade space game | Game portfolio reconciliation |
| 14 | DecayBlock | Control distracting site access | Capture; focus/control utility |
| 15 | Dog-e-dex | Identify and collect dog breeds from photos | Capture; image-to-structured-inference family |
| 16 | DOOMscroll | Play a scroll-driven game using current headlines | Game/media portfolio reconciliation |
| 17 | DummyForms | Build forms with drag/drop and AI assistance | P1 structured-intake donor |
| 18 | Flowbound | Work through procrastination/productivity exercises | Capture; execution/focus module candidate |
| 19 | Fly | Play a multiplayer flight/combat simulation | Game portfolio reconciliation |
| 20 | html-to-markdown-mcp | Convert HTML into normalized Markdown through MCP | **P0 evidence-normalization donor** |
| 21 | Lash Tracker | Track eyelash styles/application with photos | Capture; personal tracker |
| 22 | LunchBox Buddy | Turn fridge photos into school-lunch suggestions | Consolidate with vision→generation family |
| 23 | Markdown Printer | Save web pages as formatted Markdown | **P0 evidence-capture donor** |
| 24 | Mealmuse | Turn pantry/fridge photos into meal plans | Consolidate with vision→generation family |
| 25 | MenuGen | Turn restaurant-menu photos into dish visuals | Consolidate with vision→generation family |
| 26 | Mixcard | Turn Spotify playlists into printable QR postcards | Capture; media→physical-output workflow |
| 27 | Movie & TV Swiper | Discover what to watch through swipe choices | Capture; recommendation UI pattern |
| 28 | Musicwall | Organize music/videos into visual memory walls | Capture; media organization family |
| 29 | My Baby Logger | Log newborn care events | Capture; timeline/logging pattern |
| 30 | Nano-Banana-Desktop | Edit images with AI from a Linux desktop utility | Consolidate with image-editing family |
| 31 | NanoBananaEditor | Generate/edit images with AI on the web | Consolidate with image-editing family |
| 32 | NextReset | Track Codex reset history and official incident sources | **P0 operational provenance donor** |
| 33 | Nora AI | Learn through video AI tutoring, transcripts and study plans | Capture; learning/tutor family |
| 34 | Paddles.ai | Track pickleball matches and derive insights | Capture; sports analytics pattern |
| 35 | Pixel Pokemon | Play a browser pixel-art Pokémon game | Game portfolio reconciliation |
| 36 | Plinq | Access public-record information for personal safety | Capture only; privacy/legal boundary required before implementation |
| 37 | Pouched | Track a nicotine-pouch taper plan | Capture only; health/wellness boundary required |
| 38 | PrintPigeon | Upload a PDF and have it physically mailed | P1 digital→physical fulfillment pattern |
| 39 | RallyMesh | Communicate off-grid over Android Bluetooth mesh | Reconcile with Bitchat/AgentDock transport work |
| 40 | Refetch | Participate in an open-source tech-news discussion product | Capture; community/news family |
| 41 | Standup Buddy | Randomize standup order | Capture; lightweight team ritual module |
| 42 | Stories of Life | Generate bedtime stories responsive to a child’s emotions | Capture; storytelling family |
| 43 | The Great Taxi Assignment | Play a retro 3D taxi simulator | Game portfolio reconciliation |
| 44 | Time Tracker | Record time against work | Capture; execution telemetry module |
| 45 | Tower of Time | Play tower defense with time rewind | Game portfolio reconciliation |
| 46 | TrendFeed | Turn trending news into short-form video | P1; reconcile with creator/publishing console first |
| 47 | Vector Tango | Play an ATC/aerial-combat multiplayer game | Game portfolio reconciliation |
| 48 | Vibe Sail | Sail/explore/carry cargo in a multiplayer world | Game portfolio reconciliation |
| 49 | vibecodedapps.dev | Browse a verified catalog kept fresh by automated checks | **P0 source-intake/freshness donor** |
| 50 | Vibeware | Play a collection of browser microgames | Game portfolio reconciliation |

## Capability-family map

### P0: feed Agent Work OS directly

1. **Evidence/freshness intake** — vibecodedapps.dev.
2. **Runtime observability** — claude-code-statusline.
3. **MCP inspection** — Context.
4. **Evidence normalization** — html-to-markdown-mcp + Markdown Printer.
5. **Quota/incident provenance** — NextReset.

### P1: reusable workflows after P0 contracts

- CourtSync Calendar: document → extracted dated obligations → review → calendar artifact.
- DummyForms: plain-language intent → typed schema → generated intake surface.
- TrendFeed: source research → synthesis → approved production job; first reconcile with the existing creator/publishing direction.
- Bitchat + RallyMesh: offline transport; first reconcile with existing AgentDock/remote-control boundaries.
- PrintPigeon: validated document → address/fulfillment request → delivery receipt.

### Consolidate before building

- **Vision → structured/generative output:** CarbScan, Dog-e-dex, LunchBox Buddy, Mealmuse, MenuGen.
- **AI image editing:** Nano-Banana-Desktop, NanoBananaEditor.
- **Music/media:** Beatseek, Mixcard, Musicwall.
- **Learning/storytelling:** Babel Life, Nora AI, Stories of Life.
- **Games:** all game donors remain individually captured but should map to the existing game/graphics portfolio before any new repository exists.

## Donor 49 reconstruction: evidence-gated intake

### User workflow

1. A candidate source is proposed.
2. Machine-checkable evidence is evaluated.
3. Hard failures are rejected; uncertain checks become explicit human review instead of accidental acceptance.
4. Accepted inventory remains continuously freshness-checked.
5. Failures create durable work rather than silently disappearing.
6. Human and machine-readable views derive from the same canonical state.

### Failure modes to preserve as requirements

- dead/stale URL is accepted because it once worked;
- a shared hosting domain is incorrectly treated as proof that an app itself is old;
- a generic AI mention is treated as proof that a product was actually built with AI;
- one external failure causes unbounded crawling/retry;
- secrets embedded in a URL leak into receipts/logs;
- evidence disappears with no durable receipt;
- automation silently converts uncertainty into PASS;
- the catalog UI and machine inventory drift into different truths.

### Agent Work OS target boundary

We will implement a **pure, deterministic certification core** first. It does not crawl the internet and it does not mutate GitHub. A bounded discovery adapter can later gather facts and pass them into the core. This keeps policy decisions replayable and testable.

The Phase A evaluator consumes already-collected facts and emits:

- `accept`, `review`, or `reject`;
- machine-readable reasons;
- normalized evidence classes;
- a deterministic receipt ID suitable for replay comparison.

No network fetch, repository write, deployment, or tracker advancement is implied by an `accept` result.

## Behavior contracts before implementation

The implementation in this branch is allowed only against these contracts:

1. Same normalized facts + same policy produce the same receipt ID and decision.
2. `observedLive=false` is a hard reject.
3. Missing or ambiguous required evidence is `review`, not `accept`.
4. A candidate younger than a configured minimum age is a hard reject.
5. URLs carrying credentials are rejected before receipt generation so secrets are not persisted.
6. Unsupported evidence classes are rejected as invalid input.
7. An accepted certification grants **no external write authority**.
8. Source verification state and tracker state remain separate; tracker IDs are assigned only after canonical-tracker reconciliation.

## Next reverse-engineering passes

P0 passes should proceed independently but converge on shared primitives:

- claude-code-statusline → session/cost/token status contract;
- Context → MCP server inventory, capability discovery, request/response inspection and error projection;
- html-to-markdown-mcp + Markdown Printer → bounded content extraction, normalization and provenance receipt;
- NextReset → quota-window observations, official incident evidence, uncertainty and stale-state rules.

Each must pass source/evidence reconstruction, internal dedupe, target-boundary definition and behavior-contract review before feature work.