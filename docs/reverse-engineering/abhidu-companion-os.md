# REA dossier: Abhidu → Companion OS

Status: **BUILDING — clean-room reconstruction**  
Target product: **Companion OS**  
Canonical repository: `rrahul0904/agent-work-os`  
Implementation branch: `reverse/companion-os-abhidu-cleanroom`

## 1. Source / target identity

### Observable source

Public product: `https://abhidu.com/`  
Public Reddit launch: `https://www.reddit.com/r/IMadeThis/comments/1x5tu0i/looking_for_early_users_to_try_abhidu_our_ai/`  
Public Android listing: `com.abhidu.app`

Observed product problem:

- A personal-assistant surface unifies conversational help, saved material, tasks and reminders.
- Public marketing exposes three internal/product roles: thinking/chat, saved knowledge, and execution/tasks.
- Saved links can be captured from other apps; the product emphasizes forwarding/share workflows over manually filing content.
- Material is organized and later recalled through natural-language queries.
- The product is proactive around reminders and watched conditions but states that consequential actions require approval unless standing instructions exist.
- Public materials describe portability through an Obsidian-compatible export.

### Clean-room target

Companion OS is an original product implementation that solves the same general problem class while changing the product model:

- one user-facing assistant, not three user-facing characters;
- internal capability routing is invisible by default;
- deterministic local workflows work without an LLM;
- model/runtime calls go through Agent Work OS rather than being hard-coupled to one AI provider;
- memory retrieval is hybrid and correction-friendly rather than primarily tag-driven;
- approval policy is a first-class platform contract;
- evidence, verification, replay and shipping remain owned by Agent Work OS.

No source code, proprietary assets, private API calls, credentials, database schemas, prompts, or non-public implementation details from Abhidu are used.

## 2. Evidence inventory

| Evidence | Observable fact | Confidence | Reconstruction consequence |
|---|---|---:|---|
| Reddit launch post | Product combines thinking/chat, second-memory saved links, tasks/reminders/daily summaries | High | Capability graph has Think, Memory, Execute |
| Public website | Natural-language capture, persistent context, bookmarks/tasks/reminders/writing/discovery | High | One intent router with deterministic actions + runtime fallback |
| Google Play listing | Forward links/notes/PDFs, semantic filing, plain-language recall, app as home surface | High | Build share/capture adapters and normalized ingestion objects |
| Google Play listing | Consequential sending/ordering/booking/calling requires approval unless standing instruction exists | High | Human approval object and policy boundary |
| Google Play listing | Export designed for Obsidian structure | High | Portable Markdown export baseline |
| Privacy policy | AWS hosting; Google Gemini and Anthropic Claude via enterprise APIs | High | These are source implementation details only; target remains provider-neutral |
| Public 72-hour update | Recurring reminder coverage and WhatsApp reminder consistency failed | High | Recurrence semantics and delivery receipts need explicit tests |
| Public 72-hour update | New user did not understand internal `Seeker` terminology | High | Hide capability/agent topology from default onboarding |
| Public 72-hour update | Sharing directly from other apps became the dominant save path among interviewed users | Medium-high | Capture/share extension has higher priority than elaborate dashboard taxonomy |
| Public tester comment | Auto-tagging sometimes grouped material too broadly | Medium | Tags are enrichment only; retrieval uses content + metadata + embeddings and supports corrections |

## 3. Capability graph

```text
User surfaces
  ├─ Web / PWA
  ├─ Mobile share target
  ├─ Browser extension
  ├─ Messaging adapters
  └─ CLI / terminal capture
          │
          ▼
Intent + Policy Router
  ├─ CAPTURE
  │    ├─ URL / text / file normalization
  │    ├─ metadata extraction
  │    ├─ summarization/enrichment
  │    └─ memory indexing
  ├─ RECALL
  │    ├─ lexical search
  │    ├─ metadata filters
  │    ├─ vector retrieval
  │    ├─ recency / relationship ranking
  │    └─ user corrections
  ├─ PLAN / EXECUTE
  │    ├─ goals → tasks
  │    ├─ reminders / recurrence
  │    ├─ daily pulse
  │    └─ progress tracking
  ├─ THINK / COMPOSE
  │    ├─ brainstorm
  │    ├─ synthesize
  │    ├─ research through governed tools
  │    └─ draft from user material
  └─ ACTION
       ├─ risk classifier
       ├─ approval requirement
       ├─ standing instruction lookup
       ├─ connector execution
       └─ action receipt
          │
          ▼
Agent Work OS
  policy → authorization → provider/runtime → evidence → verifier → replay → Shipping OS
```

REA remains the discovery/reconstruction/evidence capability. It is **not** the authority for user actions or release shipping.

## 4. Data contracts

### CapturedItem

```json
{
  "id": "item-*",
  "ownerId": "user-*",
  "kind": "note|url|file|image|message",
  "raw": {},
  "canonicalText": "...",
  "source": {"channel": "web|share|whatsapp|telegram|browser|cli", "url": null},
  "metadata": {},
  "labels": [],
  "embeddingRef": null,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

### Task

```json
{
  "id": "task-*",
  "title": "...",
  "status": "open|done|cancelled",
  "priority": "low|medium|high",
  "dueAt": null,
  "recurrence": null,
  "sourceItemIds": [],
  "createdAt": "ISO-8601"
}
```

### ActionRequest

```json
{
  "id": "action-*",
  "intent": "send|book|order|purchase|call|publish|delete|other",
  "risk": "low|medium|high",
  "instruction": "...",
  "status": "pending|approved|denied|executed|failed",
  "standingInstructionId": null,
  "approval": null,
  "executionReceipt": null
}
```

## 5. Retrieval design

Do **not** reproduce a broad auto-tag taxonomy as the primary retrieval mechanism.

Target ranking combines:

1. normalized full-text relevance;
2. extracted metadata (source, author, date, content type);
3. embeddings / semantic similarity;
4. recency and explicit pinning;
5. graph relationships to projects/tasks/people/topics;
6. user corrections and explicit labels.

Generated tags are disposable enrichment. A user must be able to rename, merge, split, hide, or ignore generated classifications without losing the underlying item.

## 6. Reminder semantics

The source product's public build update identifies recurrence as an early failure mode. Companion OS therefore treats reminders as a scheduler contract, not a string attached to a task.

Required recurrence cases:

- once at timestamp;
- daily / weekdays;
- weekly on one or multiple days;
- monthly by day or ordinal weekday;
- interval recurrence;
- timezone-aware DST transitions;
- missed-run policy;
- snooze;
- deduplication / idempotency key;
- delivery receipt and retry policy.

No reminder is considered delivered until a channel-specific receipt is recorded.

## 7. Approval policy

Default deny for consequential actions unless one of the following is true:

- the action is read-only; or
- a narrowly scoped standing instruction explicitly authorizes this action class and constraints.

The UI must show:

- proposed action;
- destination / counterparty;
- material parameters (price, time, recipient, payload);
- source of authority;
- approve / deny;
- execution result and immutable receipt.

The current browser prototype only simulates approval. External writes are intentionally not implemented in this slice.

## 8. Product surfaces

### MVP / free

- responsive web/PWA;
- quick capture;
- saved-memory search;
- tasks and one-time reminders;
- local Markdown export;
- local deterministic routing;
- optional Agent Work OS runtime bridge.

### Pro

- cloud sync;
- semantic retrieval;
- recurring reminders;
- browser extension;
- iOS / Android share targets;
- email/calendar/messaging connectors;
- daily brief;
- multiple model providers through Agent Work OS routing.

### Enterprise

- SSO / SCIM;
- tenant isolation and regional storage;
- customer-managed model endpoints where supported;
- policy packs and connector allowlists;
- retention / legal hold / deletion controls;
- audit export;
- admin approval policies;
- BYOK / secret vault integration;
- data-loss-prevention hooks;
- evaluation, replay and provenance receipts.

## 9. Current implementation slice

Path: `/companion-os/`

Implemented on the reconstruction branch:

- responsive original UI;
- one assistant surface;
- quick capture router;
- local memory store;
- automatic lightweight labels;
- deterministic keyword recall;
- task creation/completion;
- simple natural-language reminder hints (`tomorrow`, `tonight`, `next week`);
- approval queue for consequential verbs;
- Markdown export;
- optional Agent Work OS session bridge for open-ended prompts.

The slice deliberately does **not** claim semantic embeddings, durable cloud sync, messaging integrations, production reminders, external action execution, or mobile-native share sheets yet.

## 10. Verification / golden paths

1. `remember <text>` creates a retrievable memory.
2. A pasted URL is captured as a memory item.
3. `find <keywords>` returns matching saved material.
4. `task <text>` creates an open task.
5. `remind me to <x> tomorrow` creates a task with a due timestamp.
6. Completing a task updates Today counts.
7. `send|book|order|buy|purchase|call|publish|delete ...` creates an approval instead of executing.
8. Approving an action changes state but does not perform an external side effect in the prototype.
9. Export produces user-portable Markdown.
10. When runtime settings are supplied, an unmatched open-ended prompt is forwarded to Agent Work OS using its existing authenticated session API.
11. Mobile viewport remains usable without horizontal overflow.
12. Refresh preserves local state.

## 11. Phase roadmap

### Phase 0 — evidence and clean-room boundary

- [x] identify source and public evidence;
- [x] separate observation from inference;
- [x] define capability graph;
- [x] record non-copy boundary.

### Phase 1 — local vertical slice

- [x] assistant surface;
- [x] capture;
- [x] memory;
- [x] tasks;
- [x] approval queue;
- [x] portable export;
- [x] optional Agent Work OS bridge.

### Phase 2 — durable memory service

- [ ] Postgres storage;
- [ ] content normalizer;
- [ ] FTS + vector index;
- [ ] correction-aware taxonomy;
- [ ] provenance links.

### Phase 3 — scheduler

- [ ] timezone-aware recurrence engine;
- [ ] durable job queue;
- [ ] retries / idempotency;
- [ ] delivery receipts;
- [ ] daily pulse.

### Phase 4 — capture everywhere

- [ ] PWA install;
- [ ] browser extension;
- [ ] iOS share extension;
- [ ] Android share target;
- [ ] terminal capture;
- [ ] messaging adapter contracts.

### Phase 5 — governed actions

- [ ] connector SDK;
- [ ] approval UI with material action parameters;
- [ ] standing instructions;
- [ ] policy evaluation;
- [ ] execution receipts / replay.

### Phase 6 — commercial hardening

- [ ] identity / tenancy;
- [ ] billing / plans;
- [ ] encryption and secret management;
- [ ] export / deletion workflows;
- [ ] observability;
- [ ] abuse and rate-limit policy;
- [ ] enterprise controls;
- [ ] exact-SHA deployment verification and Shipping OS release receipt.

## 12. Competitive differentiation

Companion OS should win on **trustworthy execution and portability**, not on mascot count.

Core differentiation:

- hidden provider-neutral agent topology;
- deterministic workflows before model inference;
- correction-friendly memory retrieval;
- auditable action approvals;
- local/terminal/web/mobile capture surfaces;
- user-controlled export;
- Agent Work OS evidence / verifier / replay / shipping stack;
- enterprise policy model from the beginning.

That makes this more than a personal productivity clone: it becomes a reusable **personal-agent product shell** for consumer, prosumer and enterprise deployment.
