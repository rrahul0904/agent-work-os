# riru donor → Governed Browser Autopilot

Status: `SOURCE -> EVIDENCE -> RECONSTRUCTION -> SPECIFIED -> SHIPPING-CONTRACT-READY`

Tracker ID: pending reconciliation  
Coordination issue: #91  
Canonical destination: `rrahul0904/agent-work-os`  
Related dependency: #62 Browser Learning Memory

## 1. Source manifest

Primary user-supplied source:
- https://www.reddit.com/r/SideProject/s/FVLRZa8XqU
- resolved post: https://www.reddit.com/r/SideProject/comments/1x1wjms/i_built_a_claude_in_chrome_alternative/

First-party/public evidence:
- https://www.riru.app/
- https://www.riru.app/privacy
- https://www.riru.app/terms
- Chrome Web Store extension `nheljljefcehcclgokkgcglphejebicn`

Platform evidence:
- Chrome `chrome.debugger` API documentation
- Chrome `chrome.sidePanel` API documentation
- Chrome 155 debugger enterprise-policy restriction notes

Comparators used only for capability/failure-pattern comparison:
- `uiuing/browser-agent`
- OpenSidekick
- Retriever AI / rtrvr
- chrome-bridge / Panerelay-style existing-session bridges

Research snapshot: 2026-10-09.

## 2. Evidence classification

### Verified first-party/public

riru is presented as a Chrome side-panel browser agent that can read pages, click, type, scroll, fill forms, navigate and complete multi-step tasks across multiple tabs.

Its public policy states that runs may continue after the side panel is closed, controlled tabs are visibly grouped/marked, the user can stop a run, and consequential actions are confirmation-gated.

The policy also publicly names its main service dependencies: Clerk/Google authentication, Vercel hosting, Supabase persistence, OpenRouter model routing, Exa search, Deepgram speech-to-text and Polar billing. At the policy snapshot it names the Z.ai GLM family for the main agent, GPT-family models for chat titles, and Gemini as the vision path used by older extension versions.

The extension policy documents `debugger`, `tabs`, `tabGroups`, `sidePanel`, `storage`, `cookies` and optional `notifications` permissions. It says browser history is not collected in the background, page access occurs during a user-started run, screenshots are not persisted, and only the latest two screenshots remain in live model context.

The Chrome Web Store snapshot observed during this intake reports version 1.3.0, updated 2026-09-26.

### Exact-thread feedback state

The supplied launch is extremely fresh. No substantive independent comment thread was visible at intake time. Do not manufacture sentiment.

The author-reported pain points are:
- Claude in Chrome usage limits;
- perceived slowness;
- desire for an installable browser-driving alternative.

### Adjacent-market signals, not riru reviews

Other browser-agent discussions repeatedly raise:
- desire to use the already logged-in browser/profile instead of a separate automation profile;
- reliability advantages of DOM/CDP/ref-based actions over coordinate clicking;
- concern about broad debugger authority;
- demand for visible ownership/revocation while an agent is controlling a tab;
- preference to stop on bot challenges instead of bypassing them.

These are used as engineering requirements only, not as validation of riru itself.

## 3. Reconstructed product loop

```text
user intent
  -> side-panel task/chat
  -> collect current tab/task context
  -> model chooses next typed browser action
  -> attach/control authorized tab
  -> read / click / type / navigate / wait
  -> capture post-action observation
  -> verify progress
  -> repeat across owned tabs
  -> pause if consequence requires approval
  -> resume or stop
  -> persist task/chat state
```

The key product behavior is not merely “LLM + Chrome.” It is a persistent human-visible browser execution loop operating inside the user’s real browser session.

## 4. Public architecture inference

This is a behavior-level clean-room reconstruction, not private-source reconstruction.

### Browser plane

A plausible public architecture is:

```text
Chrome MV3 extension
  ├─ side-panel UI
  ├─ extension state
  ├─ tab/group ownership
  ├─ debugger/CDP transport
  ├─ optional notifications
  └─ service-worker/event coordination
```

The `chrome.debugger` permission is the important mechanism. Chrome documents it as an extension transport into a subset of CDP domains including DOM, Runtime, Page, Input, Network, Target and related domains.

### Agent/control plane

The public policy implies a turn loop containing conversation state, page excerpts, URLs/titles, attachments and recent screenshots. Long chats are compacted into retained notes while preserving the transcript.

The browser runtime therefore needs an explicit boundary between:
- model proposal;
- action validation;
- execution authority;
- browser effect;
- post-action verification.

### Persistence plane

Public disclosures imply durable chat/task/file/account/billing state in a hosted datastore plus local extension state. Our implementation should not reproduce that topology blindly: Agent Work OS should reuse existing local-first/session/work/evidence storage and only add browser-specific records.

## 5. Internal dedupe decision

Do not create a new browser-agent product/repository.

Agent Work OS already owns:
- local daemon + control plane;
- durable sessions;
- Work Queue / approvals direction;
- restart-safe receipts;
- Browser Learning Memory in issue #62.

Issue #62 solves route memory:

```text
live observation -> candidate route -> verified route -> reusable memory -> stale/repair
```

This donor fills the missing execution layer:

```text
exact browser authority -> live observation -> browser action -> live verification -> receipt
```

The integrated target becomes:

```text
Governed Browser Autopilot
  -> verified browser action receipts
  -> Browser Learning Memory
  -> remembered route candidate
  -> live re-verification
```

Memory never outranks the live page.

## 6. Product boundary

### Match

- Chrome side-panel operator UI
- control of the real logged-in browser session
- multi-tab tasks
- background continuation
- visible controlled-tab state
- explicit Stop
- consequence confirmations
- resumable task state
- bounded screenshot/vision context
- notifications for completion/approval

### Improve

- plan is not authorization;
- exact-intent action grants;
- exclusive expiring tab lease;
- post-action DOM/state verification;
- deterministic observations/actions/receipts;
- browser/profile/login-context checks;
- restart reconciliation;
- enterprise-policy failure typing;
- DOM/accessibility first, screenshot fallback;
- explicit CAPTCHA/bot-challenge handoff to user;
- pluggable model/provider lane;
- later local/BYOK lane;
- issue #62 route reuse only after fresh verification.

### New owned contracts

- `browser-target/v1`
- `browser-observation/v1`
- `browser-action/v1`
- `browser-run-plan/v1`
- `browser-execution-grant/v1`
- `browser-tab-lease/v1`
- `browser-action-receipt/v1`
- `browser-run-receipt/v1`

### Omit/defer

- riru branding/UI/assets/copy
- private prompts or model-routing internals
- credential/OTP discovery
- CAPTCHA solving or anti-bot circumvention
- unrestricted history/network capture
- hidden cross-profile control
- automatic send/pay/delete without policy/approval
- billing/allowances in the first slice
- “works on every website” claims

## 7. Phase A behavioral contract

Phase A is fixture-first and provider-independent.

### BrowserTarget

Must bind:
- machine/browser/profile/session identity;
- tab/target/frame identity where available;
- current URL/origin/title;
- browser + adapter version;
- debugger attach/capability state;
- observed managed-policy restrictions;
- deterministic digest.

### BrowserObservation

Must contain:
- target digest + URL/origin;
- source class (`dom`, `accessibility`, `screenshot`, `network_metadata`, `tab_metadata`);
- bounded/truncated payload facts;
- observed-at time;
- sensitive-field redaction facts;
- deterministic digest.

Screenshot pixels are ephemeral by default. Durable records carry digest/metadata unless a separate policy explicitly authorizes retention.

### BrowserAction

Initial typed actions:
- `navigate`
- `open_tab`
- `close_owned_tab`
- `click_ref`
- `focus_ref`
- `type_ref`
- `set_value_ref`
- `select_ref`
- `scroll`
- `wait_for`
- `read_snapshot`

Each action declares an effect class and expected postcondition.

### BrowserRunPlan

A pure plan binds task/run/target/policy context, allowed origins, step budget, action/effect classes, consequence policy and observation budget. It grants no authority.

### BrowserExecutionGrant

A grant binds the exact plan, target/profile/tab/origin, action/effect class, expiry and attempt identity. It cannot silently widen authority after redirect or target drift.

### BrowserTabLease

One controller per target. Lease must be expiring, revocable, heartbeat-backed and invalidated on detach/tab close. Reconnect does not silently restore expired authority.

### BrowserActionReceipt

Must record exact plan/grant/lease/target/action digests, before/after observations, actual final URL/origin, adapter command class, observed effect, postcondition and terminal outcome.

## 8. Consequence taxonomy

First-pass effect classes:

```text
read
navigation
local_edit
external_send
purchase
create
delete
auth_security
```

Higher-risk effects require an explicit policy decision and, where configured, a separate human approval artifact bound to the exact target/action/payload.

## 9. Negative and recovery gates

Required tests include:
- plan alone cannot act;
- Tab A grant cannot control Tab B;
- origin drift invalidates an origin-bounded grant;
- expired/revoked lease cannot act;
- concurrent lease claims fail closed;
- Stop revokes authority immediately;
- debugger attach failure is typed;
- Chrome 155 enterprise blocked-host/screenshot/DLP refusal becomes `policy_blocked` rather than retrying forever;
- debugger detach / target close becomes interrupted;
- unobserved cross-origin frame state remains unknown;
- stale element refs fail and require fresh observation;
- model prose is not an executable locator;
- transport success without postcondition success is not browser-task success;
- send/purchase/create/delete respects consequence approval policy;
- changed approval payload invalidates approval;
- bot challenge becomes `needs_user`;
- password/card/OTP-like material is not persisted;
- screenshot pixels are not durably persisted by default;
- restart during action becomes interrupted/reconciliation state;
- completion requires final live observation;
- Browser Learning Memory cannot override failed live verification;
- canonical inputs yield stable digests.

## 10. Implementation sequence

### B — fake adapter

Build a deterministic in-memory browser fixture proving contracts, leases, redirect/origin checks, consequence gates and receipts.

### C — Chrome MV3 extension

Minimal side-panel + CDP adapter:
- user-started run;
- attach/detach;
- DOM/accessibility snapshot;
- ref-based click/type/navigation;
- visible controlled-tab marker/group;
- Stop/revoke;
- control-plane transport.

### D — agent loop

Model chooses only normalized typed BrowserActions. Runtime validates before execution. Do not expose arbitrary model-to-CDP passthrough.

### E — approvals/attention

Bind consequence pauses to existing Agent Work OS approval/Work Queue facts.

### F — Browser Learning Memory

Promote only verified successful routes into #62 memory. Retrieval remains advisory.

### G — recovery

Certify panel close/reopen, service-worker suspension, tab reload/redirect, browser restart and control-plane reconnect.

### H — browser UAT

Use owned/local fixtures to prove multi-tab work, frames, stale refs, stop/revoke, consequence approval, managed-policy refusal and recovery.

### I — packaging

Only after exact-head CI + browser receipts + permission/privacy review should Chrome Web Store packaging/submission become eligible.

## 11. Shipping definition

This donor is not complete from specification or unit tests alone.

Completion requires:
- implementation in canonical repo;
- exact-SHA CI;
- real Chrome MV3 fixture execution;
- consequence-gate proof;
- stop/revoke proof;
- background continuation/recovery proof;
- enterprise-policy negative-path evidence;
- issue #62 integration proof;
- browser UAT receipts;
- package/store evidence if that release surface is chosen;
- tracker synchronization from receipts.

Current truthful status: research/specification complete enough for a bounded implementation campaign, but feature implementation remains `BLOCKED_WIP` until an implementation slot is available or the browser runtime is promoted as a dependency of an active shipping campaign.

## 12. Clean-room/non-claims

No private riru service probing, extension decompilation, source extraction, prompt extraction or proprietary-implementation claim was used. This work uses public product behavior, public policy disclosures, Chrome platform documentation and independent comparator patterns.

No riru parity, no production readiness, no Chrome Store readiness and no tracker ID are claimed by this dossier.