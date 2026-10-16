# Svipall donor analysis -> governed local web runtime

Status: research / architecture only  
Tracker target: RE-229  
Canonical destination: `rrahul0904/agent-work-os`  
Branch: `reverse/svipall-local-web-runtime`  
Issue: #1  
Date: 2026-09-23

## 1. Scope and provenance

This document records a clean-room reverse-engineering analysis of the public product behavior and public architecture of **Svipall** (`ilien-dev/svipall`) for use as a capability donor inside Agent Work OS.

Public references:
- Reddit creator post: https://www.reddit.com/r/claudeskills/comments/1wooked/reddit_blocked_me_halfway_through_a_research/
- Repository: https://github.com/ilien-dev/svipall
- README: https://github.com/ilien-dev/svipall/blob/main/README.md
- Architecture notes: https://github.com/ilien-dev/svipall/blob/main/docs/architecture.md
- Skill surface: https://github.com/ilien-dev/svipall/blob/main/skill/SKILL.md

The upstream project is AGPL-3.0. This branch does **not** copy upstream source, implementation text, assets, protocol structures, or branding. We are extracting public product patterns and independently specifying an Agent Work OS implementation. If code reuse is ever proposed, licensing compatibility must be reviewed explicitly instead of silently blending source.

## 2. Product thesis

Svipall's transferable idea is not "scrape harder." It is a **local web acquisition substrate for agents** that:

1. starts with the least expensive public-page acquisition method;
2. escalates only when evidence says a richer browser path is needed;
3. returns agent-ready content instead of raw page noise;
4. reports incomplete, blocked, gated, or low-quality outcomes explicitly;
5. remembers domain observations so later calls can make better routing decisions;
6. keeps browser state, cookies, profiles, logs, and optional models on the local machine;
7. exposes the same capability through multiple agent-friendly surfaces.

For Agent Work OS, the strategic fit is strong because the existing architecture already has a trusted local daemon, normalized session/event transport, and a browser-accessible control plane. The web runtime should live behind that daemon so source code, credentials, browser profiles, and browsing history do not need to move into the hosted control plane.

## 3. Observed public capability map

### 3.1 Acquisition

Observed public surfaces include:
- direct HTTP reads;
- rendered browser reads;
- browser sessions with persisted state;
- page snapshots suitable for deterministic element references;
- browser actions such as click/type/scroll/wait;
- screenshots;
- bounded network-response capture;
- manual-login/profile persistence;
- per-domain learned routing and pacing.

The upstream product describes multiple browser identities and challenge-oriented tiers. Agent Work OS should **not** clone those internals. Our implementation boundary is a provider-neutral acquisition policy that chooses among approved adapters and reports why it stopped.

### 3.2 Extraction and structured output

Observed behavior includes:
- HTML/page -> clean Markdown/text;
- relevance-filtered extraction;
- table extraction;
- repeated-record/schema induction;
- document extraction for common office/PDF formats;
- optional file output to keep bulk data out of model context;
- quality labels and duplicate/corroboration observations.

The important donor pattern is the **result contract**: content is never sufficient by itself. The agent also needs provenance, quality, truncation/gate evidence, acquisition method, redirect/final URL, timing, and budget consumption.

### 3.3 Research workflows

Observed workflows include:
- keyless web search over public engines;
- same-site URL discovery;
- bounded crawl with persisted frontier/resume;
- network JSON capture for page-backed APIs;
- page diff/watch;
- small durable notes/memory;
- per-domain logs/status.

For our implementation these become separate, composable operations instead of a monolithic "browse" tool.

### 3.4 Integration surfaces

Observed upstream surfaces include MCP, CLI, REST, and an agent skill.

Agent Work OS already has its own daemon/control-plane protocol. Therefore the first implementation should use the existing local daemon as the primary runtime boundary, then add MCP/CLI wrappers later only if they add value. Do not create a second privileged localhost control plane just to mimic upstream shape.

## 4. What we should build differently

### 4.1 Core rule: evidence before escalation

Every acquisition attempt emits an evidence record. Escalation is allowed only when a policy rule matches explicit evidence, for example:
- JavaScript-required shell;
- redirect loop;
- empty body with rendered-content indicators;
- login gate;
- paywall/subscription gate;
- robots/policy denial;
- rate limiting;
- unsupported content type;
- timeout/transport failure.

A quality label by itself does not trigger a more invasive browser path.

### 4.2 Fail-closed access policy

The runtime must not promise to bypass access controls. A result can be:
- `ok`
- `partial`
- `blocked`
- `login_required`
- `paywall`
- `robots_denied`
- `rate_limited`
- `unsupported`
- `failed`

When human verification is required, the runtime returns a structured stop condition. It does not loop or silently attempt increasingly aggressive behavior.

### 4.3 Local trust boundary

Sensitive runtime material stays on the daemon host:
- cookies;
- browser profiles;
- credentials/secrets;
- local document paths;
- raw screenshots unless explicitly requested;
- request logs containing private URLs.

The hosted/control-plane side receives only the minimum normalized event/result data required for the active session.

## 5. Proposed Agent Work OS architecture

```text
Browser UI / Agent session
          |
          | existing REST + WebSocket control plane
          v
services/control-api
          |
          | server.command
          v
runtime/daemon
          |
          +--> WebAcquisitionService
          |      |
          |      +--> HttpAdapter                [Phase A]
          |      +--> BrowserAdapter             [later]
          |      +--> DocumentAdapter            [later]
          |      +--> SearchAdapter              [later]
          |
          +--> DomainPolicyStore
          +--> ContentExtractor
          +--> QualityClassifier
          +--> Crawl/Watch stores                [later]
```

### 5.1 New daemon capability

The daemon should advertise a separate capability, for example:

```json
{
  "name": "web",
  "kind": "web_acquisition",
  "operations": ["fetch"],
  "version": 1
}
```

Later operations can be added without overloading coding-agent adapters.

### 5.2 Proposed command/action

Add a bounded daemon command:

`web.fetch`

Suggested payload:

```json
{
  "url": "https://example.com/",
  "query": "optional relevance hint",
  "maxBytes": 1000000,
  "maxOutputChars": 50000,
  "timeoutMs": 15000,
  "policy": "public_read"
}
```

The local daemon executes the request and emits normalized web events. It must validate URL scheme, reject loopback/private-network targets by default, and apply domain budgets.

### 5.3 Proposed result envelope

```json
{
  "kind": "web.result",
  "requestId": "uuid",
  "url": "https://example.com/",
  "finalUrl": "https://example.com/",
  "status": "ok",
  "httpStatus": 200,
  "acquisition": {
    "adapter": "http",
    "attempts": 1,
    "elapsedMs": 184
  },
  "content": {
    "format": "markdown",
    "text": "...",
    "chars": 1234,
    "truncated": false
  },
  "quality": {
    "label": "full",
    "reasons": []
  },
  "gate": null,
  "provenance": {
    "retrievedAt": "ISO-8601",
    "contentType": "text/html",
    "source": "remote_public_web"
  }
}
```

A blocked/gated response is still a completed tool execution but not a successful content retrieval. Callers must inspect `status` and `gate`, not only transport success.

## 6. Data contracts

### WebRequest
- requestId
- sessionId
- url
- query?
- maxBytes
- maxOutputChars
- timeoutMs
- policy
- createdAt

### WebAttempt
- requestId
- adapter
- startedAt
- endedAt
- httpStatus?
- errorCode?
- redirectCount
- bytesRead
- evidence[]

### GateEvidence
- kind
- confidence
- evidence[]
- retryAfterSeconds?
- humanActionRequired
- note

### ContentQuality
- label: full | partial | thin | empty | unknown
- reasons[]
- truncated
- duplicateOf?

### DomainPolicyState
- domain
- lastAttemptAt
- rollingAttemptCount
- cooldownUntil?
- learnedAdapter?
- lastOutcome?
- updatedAt

Phase A can keep domain state in memory so behavior is deterministic and testable. Persistence belongs in a separate slice.

## 7. Security and abuse-resistance requirements

Phase A requirements:
- allow only `http:` and `https:`;
- block localhost, loopback, link-local, RFC1918/private ranges, metadata endpoints and non-routable targets by default;
- limit redirects;
- re-check redirect targets against SSRF policy;
- cap response bytes and output size;
- cap per-domain attempt frequency;
- use a descriptive user agent owned by this product;
- never forward control-plane auth tokens to target sites;
- strip hop-by-hop/sensitive headers;
- do not log response bodies by default;
- redact URL userinfo and secret query parameters where practical;
- reject credential-bearing URLs;
- no arbitrary caller-supplied proxy/header/body support in Phase A;
- no automatic CAPTCHA solving or anti-bot bypass in Phase A.

Later browser work must additionally isolate profiles, browser downloads, filesystem access, eval/script execution, and network capture.

## 8. Clean-room implementation plan

### Phase A — public-page read vertical slice

Repository changes:
- `runtime/daemon/src/web/contracts.js`
- `runtime/daemon/src/web/http-adapter.js`
- `runtime/daemon/src/web/extract.js`
- `runtime/daemon/src/web/policy.js`
- `runtime/daemon/src/web/service.js`
- protocol/control-plane routing for one `web.fetch` action
- local fixture server for acceptance tests
- focused tests

Acceptance:
1. start control plane + daemon;
2. daemon advertises web capability;
3. control plane sends one bounded public-read request to a local **test fixture** that stands in for a remote public page;
4. daemon returns normalized Markdown/text + provenance + quality;
5. an oversize response is truncated/blocked deterministically;
6. a redirect to a prohibited address fails closed;
7. repeated calls hit domain budget/cooldown deterministically;
8. no external network is required in CI.

### Phase B — rendered browser read

Add a browser adapter only after Phase A is stable:
- browser lifecycle owned by daemon;
- rendered HTML extraction;
- snapshot roles/refs;
- explicit browser-needed evidence;
- profile isolation;
- no arbitrary JS evaluation in the initial slice.

### Phase C — research workflows

Add independently:
- bounded same-site crawl + resumable frontier;
- URL map/sitemap ingestion;
- search provider adapters;
- network JSON capture;
- duplicate/corroboration signals;
- file export;
- diff/watch.

### Phase D — documents and richer extraction

Add:
- PDF/office document adapters;
- table/repeated-record extraction;
- schemas with confidence and source evidence.

### Phase E — governed human interaction

Only if justified:
- manual login window;
- profile persistence/export policy;
- human-verification pause/resume.

No automatic access-control circumvention is required to deliver the core product value.

## 9. Test matrix

### Unit
- URL validation and SSRF blocks
- redirect revalidation
- byte/output budgets
- HTML sanitization
- Markdown normalization
- quality classification
- gate classification
- per-domain throttling
- deterministic result serialization

### Integration
- fixture HTTP 200 article
- redirect
- 404
- 429 + retry-after
- login-gate fixture
- paywall marker fixture
- empty JS shell fixture
- oversized body
- malformed HTML
- unsupported content type

### Acceptance
Extend `scripts/acceptance.mjs` with an isolated fixture server and one end-to-end `control API -> daemon -> web service -> normalized event -> persisted session evidence` path.

### Non-claims until verified
- no browser automation parity;
- no crawl/search parity;
- no document-extraction parity;
- no watch/diff parity;
- no challenge/CAPTCHA parity;
- no hosted production certification.

## 10. Product surface for Agent Work OS

The UI should eventually show web work as evidence attached to an agent session:
- requested URL/domain;
- status;
- acquisition method;
- quality/gate badge;
- final URL;
- retrieved-at timestamp;
- source excerpt or file artifact;
- retry/cooldown state;
- "open locally" action for any human step.

This keeps web research auditable instead of hiding it inside an agent transcript.

## 11. Tracker interpretation

This donor should be tracked as:
- source product: Svipall
- canonical project: Agent Work OS
- relationship: capability donor / governed local web + research runtime
- repository: `rrahul0904/agent-work-os`
- implementation state at this commit: research/spec only
- launch state: not launch-certified
- next concrete action: implement Phase A only, then obtain exact-head CI evidence before broadening scope.

## 12. Decision

Proceed with the **Phase A public-page read vertical slice** inside Agent Work OS.

Do not create a separate Svipall clone. Do not claim parity with the upstream project. The immediate value is a trustworthy local web acquisition contract that Agent Work OS can govern, observe, and later extend.
