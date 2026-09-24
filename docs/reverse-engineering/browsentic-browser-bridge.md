# Browsentic capability donor → Agent Work OS browser bridge

Status: reverse-engineering / architecture contract
Tracker: RE-231
GitHub tracking: #3

## Source evidence

- Reddit discovery: https://www.reddit.com/r/DigitalEscapeTools/s/53wtk0iQa6
- Public upstream: https://github.com/imshaikot/browsentic
- Public docs: https://browsentic.com/docs
- Upstream license observed: MIT

## Product thesis

Browsentic demonstrates a local-first agentic-browser pattern in which the agent controls the user's already logged-in browser rather than launching a separate headless browser. Its useful donor pattern is not the brand or UI; it is the control-plane architecture connecting browser extension, loopback daemon, agent CLI and MCP clients while keeping the browser session local.

Agent Work OS already has the right canonical home for this capability: a local authenticated daemon, normalized session/event transport, agent adapters and operator UI. The donor therefore expands Agent Work OS with a browser bridge rather than creating another product repository.

## Observed upstream architecture

Public upstream documentation describes four cooperating local processes:

1. Browser extension — side panel, popup, background/service worker and per-page content script.
2. Local daemon — owns the live browser link, authorization and side-panel agent runs.
3. Thin stdio MCP process per external client — translates MCP calls into daemon control frames.
4. Spawned agent CLI per side-panel instruction — reasons and calls the same browser tool surface through the daemon.

The extension initiates a loopback WebSocket because MV3 service workers cannot listen for inbound connections. The daemon owns one browser link and can fan that link out to multiple MCP clients.

### Why this matters for Agent Work OS

Agent Work OS can reuse its existing daemon/session boundary and add a browser-link subsystem instead of standing up a second control plane. The browser becomes a governed execution target associated with the same machine, session, run, actor and audit identities already used by the OS.

## Capability inventory

### Browser link

- pair extension to the local daemon
- loopback-only transport
- browser/extension identity and protocol version negotiation
- browser capability manifest
- reconnect after service-worker suspension
- active-tab and frame inventory
- one browser link shared safely by multiple logical clients

### Deterministic action registry

Start with a generated/versioned registry shared by daemon and extension. Later expand toward the public donor's broad action surface without promising parity prematurely.

Phase A actions:

- browser.readRenderedText
- browser.click
- browser.typeText (submit disabled)

Phase B candidate actions:

- key press
- scroll
- navigation
- tab open/close/switch
- frame targeting
- screenshots
- downloads/uploads
- console/network metadata
- drag/drop
- element pointing
- WebMCP/site registered tools

Registry requirements:

- stable action IDs
- Zod/JSON-schema validation
- per-action capability flags
- per-action policy classification
- protocol/action-registry version hashes
- drift rejection rather than best-effort coercion

## Request paths

### Path A — external tool/MCP caller

external client -> Agent Work OS tool adapter -> daemon browser bridge -> extension background -> tab content script -> result -> normalized Agent Work OS event

External callers have no implicit human approval channel. Any policy result requiring confirmation must fail closed unless a separately authenticated approval channel exists for that exact run/action.

### Path B — operator/side-panel instruction

user -> browser side panel/operator UI -> Agent Work OS run -> chosen agent adapter -> browser tool calls -> daemon -> extension -> page

The side-panel path can pause for approval because the user is visibly present. Approval must be bound to the exact actor/run/action/host/tab and must never silently become a global permission.

## Security model

### Pairing and local peer authentication

- listen only on loopback
- fresh install must not connect until explicit pairing
- distinguish extension-origin peers from ordinary web-page origins
- challenge/response pairing with replay-resistant nonces
- rotate session credentials
- expire stale browser links
- refuse protocol downgrade outside the supported compatibility window

### Browser data boundary

- rendered page content is data, not authority
- label/fence untrusted page text before it enters agent context
- sanitize credentials, tokens, cookies, card data and secrets before any event/log/model path
- keep plaintext secret material browser-local whenever possible
- no automatic raw HTML or response-body reads
- no cookie export surface

### Run scope

Run scope is derived from operator-controlled inputs such as the starting host and explicitly named destinations. Page content may not widen scope. Cross-host navigation is confirmation-required or denied according to policy.

### Policy engine

Use deterministic allow / confirm / deny outcomes with the most restrictive matching rule winning.

Initial policy:

| Condition | Default |
|---|---|
| rendered-text read | allow |
| ordinary click | allow |
| type without submit | allow |
| form submit / Enter-to-submit | confirm |
| off-scope navigation | confirm |
| file upload/download | confirm |
| site/WebMCP tool invocation | confirm |
| raw HTML | deny |
| network response bodies | deny |
| unknown/reserved action | deny |
| javascript:/data:/file: navigation | deny |
| external script injection/execution | deny |
| secret in URL | deny |

### CAPTCHA / bot challenges

Do not make generic bypass claims. The bridge may detect that a challenge exists and surface it for human handling. Any future challenge-specific automation must be separately reviewed for product policy, site terms and safety before implementation.

## Data contracts

### BrowserPeer

- browserPeerId
- machineId
- extensionInstanceId
- browserFamily
- extensionVersion
- protocolVersion
- registryHash
- capabilities
- connectedAt
- lastHeartbeatAt

### BrowserRunContext

- runId
- sessionId
- actorId
- browserPeerId
- tabId
- frameId
- startingOrigin
- allowedOrigins
- approvalMode
- createdAt

### BrowserActionRequest

- requestId
- runId
- actionId
- args
- target tab/frame
- expected origin
- action registry version
- deadline

### BrowserActionResult

- requestId
- status
- normalized result
- observed origin
- page revision/navigation marker
- timing
- policy decision
- evidence references
- structured error

## State and provenance

Every action should be attributable to:

- machine
- browser peer
- Agent Work OS session
- run
- caller/agent adapter
- tab/frame
- action definition version
- policy decision
- user approval, when any
- evidence artifact IDs

Local persisted state should contain metadata and policy decisions, not browser credentials or secrets.

## Reusable automation model

Later phases can add:

- deterministic recording and replay
- site skill notes
- saved page/site tools
- site maps
- schedules/repeats

Saved automation must pin origin/path/action-registry version and preserve provenance. A previously approved tool must not inherit permission to run on a materially different origin or changed code body.

## Multi-client and multi-tab concurrency

Sharing one logged-in browser introduces state races. Every action therefore needs explicit tab/frame/run correlation.

Required rules:

- no global implicit active-tab assumption in daemon APIs
- a run can pin a tab
- switching tabs outside the pinned scope is confirmation-required
- client actions are correlated independently
- navigation changes page revision/state and can invalidate stale element references
- concurrent agents must not inherit another agent's approval grants

## Failure semantics

Fail closed on:

- unpaired or unauthenticated peer
- origin mismatch
- stale/replayed handshake
- unsupported protocol or registry version
- unknown action
- malformed destination
- off-scope action when approval cannot be obtained
- tab/frame not found
- page navigation invalidating target
- timeout
- secret handling failure

Never convert these into silent best-effort browser actions.

## Implementation phases

### Phase A — bridge foundation

- BrowserBridgeProtocol envelopes in packages/protocol
- daemon loopback browser endpoint
- minimal Chromium MV3 extension
- explicit local pairing
- peer heartbeat/reconnect
- active tab metadata
- rendered-text read
- safe click
- safe text entry without submit
- action registry and drift check
- run/tab/origin scope
- initial policy evaluator
- deterministic unit/integration fixtures

Exit: repository tests and protocol tests pass. This does not prove browser readiness.

### Phase B — real-browser certification

- browser-driven acceptance harness
- navigation with approval
- iframe/frame targeting
- screenshot evidence
- point-at-element
- browser restart/service-worker recovery
- exact commit evidence bundle

Exit: real Chrome/Chromium evidence captured against exact head; no secret leakage; allow/confirm/deny paths verified.

### Phase C — files and diagnostics

- download capture
- upload staging
- console diagnostics
- network metadata
- bounded artifact storage

### Phase D — reusable browser skills

- record/replay
- site notes/maps
- saved page/site tools
- provenance/version gates

### Phase E — advanced interoperability

- MCP exposure
- WebMCP/site tools
- additional agent adapters
- multi-agent multi-tab scheduling
- Firefox support
- voice

Each phase requires independent evidence before its capability is advertised as production-ready.

## Test matrix

### Unit

- message schema validation
- registry hash/version drift
- policy rule precedence
- run-scope derivation
- URL classification
- approval binding
- secret sanitizer behavior
- stale request rejection

### Integration

- extension pair/unpair
- daemon reconnect
- tab attach/detach
- rendered read round trip
- click round trip
- text entry round trip
- off-scope denial when no approval channel exists
- malformed navigation denial

### Browser acceptance

- logged-in-browser session remains local
- exact tab is targeted
- page navigation invalidates stale targets
- user approval card gates consequential action
- separate client cannot reuse approval
- secret-like values are absent from logs/events
- restart/reconnect recovers cleanly

## Delivery evidence contract

A donor phase is not complete until the exact branch/head has:

1. committed implementation
2. focused tests
3. full repository tests
4. exact-head CI evidence
5. real-browser evidence where browser behavior is claimed
6. documented remaining blockers

Repository evidence and hosted/browser evidence must remain separate.

## Current smallest truthful next action

Implement Phase A only: protocol envelopes + loopback browser peer + minimal MV3 extension + rendered read/click/non-submit type + policy/registry tests. Do not start record/replay, WebMCP, CAPTCHA handling, script injection or scheduling until the bridge and approval boundary are independently certified.

## Non-goals for the first slice

- no generic CAPTCHA solver
- no anti-bot bypass
- no arbitrary JS injection
- no raw cookie/session-token export
- no hidden browser profile cloning
- no broad crawl/search parity claim
- no Firefox/mobile packaging claim
- no production readiness claim

## Source/licensing note

Upstream is publicly presented as MIT licensed. This document is a behavioral/architectural donor analysis for Agent Work OS. It does not claim that upstream source code has been copied into this repository.