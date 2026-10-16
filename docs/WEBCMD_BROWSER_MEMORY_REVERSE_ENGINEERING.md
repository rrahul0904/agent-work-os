# Webcmd → Agent Work OS Browser Learning Memory

Status: implementation slice in progress  
Source work item: GitHub issue #62  
Target: `agent-work-os` (no duplicate repository)

## 1. Source identification

Primary source:
- Reddit post: `Codex can now remember how websites work instead of figuring them out every time`
- Donor repository: `agentrhq/webcmd`
- Product site: `https://webcmd.dev/`
- License: Apache-2.0

Evidence classes used here:
- `first-party-public`: Reddit source post and webcmd.dev product/docs pages.
- `official-source`: public `agentrhq/webcmd` repository, README, benchmark report and GitHub issues.
- `internal-evidence`: Agent Work OS repository state, tests, CI and later UAT receipts.

## 2. Product reconstruction

Webcmd's core loop is not simply browser automation. It progressively moves repeated website work out of the model reasoning loop:

1. Control a live browser on an unfamiliar site.
2. Remember observed pages, states, actions, workflows, APIs, pitfalls and fallback paths.
3. Convert stable repeated behavior into a reusable adapter/command.
4. Execute the known path with fewer browser/model turns.

The product explicitly treats live browser state as the source of truth and memory as reusable navigation context. Profiles persist authenticated browser state while Sessions are separate browser windows inside a profile.

## 3. What is worth absorbing

### MATCH
- explicit browser profile/session identity
- local durable site memory
- remembered pages/actions/workflows/pitfalls
- safe fallback to live browser exploration
- compact machine-readable browser evidence

### IMPROVE
- memory promotion must be proof-gated rather than merely observed
- stale/drift behavior must be first-class and bounded
- every memory mutation should emit a deterministic evidence receipt
- profile/workspace isolation must be enforced by storage design
- secret/cookie/token-shaped material must be rejected from navigation memory
- memory roots/files must refuse symlinks
- repair should create a revision, preserving history instead of silently rewriting it

### NEW for Agent Work OS
- link memory promotion to run verification and Shipping OS receipts
- attach exact browser/session/run evidence digest to learned routes
- support autonomous supervisor decisions: reuse, explore, repair, invalidate
- expose route trust and staleness to agents as explicit state

### OMIT from v0
- donor branding and CLI surface
- donor-specific CloakBrowser runtime assumptions
- cloud marketplace/plugin system
- generated site adapters
- benchmark claims as acceptance proof

### INVESTIGATE later
- page-state structural diffs and snapshot pruning
- network-call/API discovery and promotion
- adapter/command synthesis
- hosted/local parity
- multi-agent concurrent browser leasing

## 4. Donor benchmark evidence

The donor's published BU Bench V1 report says its final system passed 67/100 tasks and averaged 9.8 controller turns per completed task, versus 55/100 for Playwright CLI and 47/100 for agent-browser in the published comparison. The report attributes the gain to a combination of multi-step browser programs, snapshot pruning and structural page diffs.

This is useful directional evidence, not proof for Agent Work OS. The report documents one complete run per tool rather than repeated trials with confidence intervals. Agent Work OS must run an independent benchmark before claiming parity or improvement.

## 5. User/pain-point evidence

Open donor issues expose important failure boundaries that our design should encode rather than rediscover:

- wrong or unverifiable Chrome profile selection can make authenticated automation unsafe (#534)
- dead browser contexts can appear healthy and then fail navigation; recovery must be bounded (#293)
- hidden scroll containers can yield apparently successful but incomplete extraction (#417)
- extension/adapter argument collisions can break the whole command surface (#441)
- transient browser events such as file chooser handling can differ between abstraction and runtime (#448)
- local/hosted site-memory parity needs explicit manual end-to-end validation (#311)

These become negative acceptance cases for later browser UAT and runtime integration.

## 6. Target architecture

```text
Browser session (live truth)
        |
        v
Observed page/action/workflow
        |
        v
Candidate Route  -- verification failed --> candidate/failure evidence
        |
   verified outcome
        v
Verified Route (trusted advisory memory)
        |
  repeated drift/failure
        v
Stale Route --> live exploration --> repaired revision
```

Storage scope:

```text
workspace + browser profile + site origin + goal -> route revisions + evidence
```

Session IDs are evidence attributes, not storage partition keys. This lets independent browser windows reuse profile-scoped navigation knowledge without sharing execution identity.

## 7. v0 behavior contract

A remembered route is advisory, never authoritative.

- A route begins as `candidate`.
- It becomes `trusted` only after the configured number of externally verified successes.
- It becomes `stale` after bounded consecutive failures or explicit drift evidence.
- A repaired path creates a new revision; stale history is preserved/superseded.
- Suggestion output always requires browser revalidation.
- Missing/corrupt/unavailable memory returns a safe fallback instruction rather than blocking browser work.
- Storage is deterministic, atomic and local.
- Secret-shaped keys/values are rejected.
- Symlink-backed memory paths are rejected.
- Profile/workspace scopes are cryptographically partitioned.
- Every learning event emits a SHA-256 evidence receipt.

## 8. Independent acceptance gates

### Code gate
- unit/contract tests green at exact PR head SHA
- existing Agent Work OS tests remain green
- no secret or traversal regression

### Browser UAT gate
At least two real sites:
- first run explores and records route
- second verified run promotes/reuses route
- forced selector/layout drift stales route
- recovery produces a new revision
- restart preserves learned route
- wrong-profile test fails closed

### Completion gate
Do not mark COMPLETE until code + CI + real-browser UAT + restart recovery + exact-SHA receipt + tracker synchronization are all present.

## 9. Current implementation slice

`runtime/browser-memory/src/index.js` implements:
- deterministic site/scope keys
- candidate/trusted/stale/superseded route states
- configurable success/failure thresholds
- immutable repair revisions
- profile/workspace isolation
- safe corrupt-memory fallback on reads
- secret-field/value rejection
- symlink refusal
- atomic JSON writes
- SHA-256 learning receipts

`runtime/browser-memory/test/browser-memory.test.js` covers the initial contract. Hosted browser wiring, real browser UAT and independent comparative benchmarking remain intentionally open.
