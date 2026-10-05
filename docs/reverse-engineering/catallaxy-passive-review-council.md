# Catallaxy donor study: passive review council

Date: 2026-10-05  
Tracking issue: #35  
Implementation base: RE-372 exact head `dfad4aec6112346e883a294bf20eedd8097cf500`

## Source validation

User-supplied Reddit source:

- https://www.reddit.com/r/claudeskills/s/8VTefiW0XJ

Public first-party evidence reviewed without installing or accessing the beta software:

- https://catallaxy.app/
- https://catallaxy.app/faq
- https://catallaxy.app/about
- https://catallaxy.app/terms
- https://github.com/SiliconValleyPirate/Catallaxy/blob/main/README.md

Adjacent public comparators used only to understand the problem space:

- Anthropic Claude Code Review documentation
- `daulet/reviewer`
- `yuuichieguchi/Calyx`
- Threadlines
- Buck (`rjamesy/buck`)

## Clean-room / legal boundary

Catallaxy's published closed-beta terms prohibit reverse-engineering the Software and prohibit using the Software, beta access, or non-public information to build a competing passive-observer product. This project therefore does **not** install or run Catallaxy, inspect binaries, decompile/disassemble it, probe hidden endpoints, derive private data formats or algorithms, copy prompts/personas/assets/branding/UI, or use beta-only information.

Only public product behavior and public documentation are treated as donor evidence. The implementation is independently authored against Agent Work OS's existing contracts.

## Verified public behavior

Public documentation establishes the following observable product behavior:

1. A local macOS app watches Claude Code/Cowork and Codex/ChatGPT Work session transcripts.
2. Reviewers are passive observers/advisors. They do not edit project files and are intentionally distinct from coding subagents.
3. A reviewer combines two axes: an authored persona and a bound model/provider.
4. Review rooms persist per project and can contain multiple independent observers.
5. Consultations may be manual or automatic. Reddit discussion clarifies manual is the default and automatic consultation increases usage.
6. Observations use a 1..5 degree/severity system and a room threshold promotes important observations into alerts.
7. Multiple observers flagging the same concern is presented as stronger signal, but the documented workflow still asks the acting agent to verify claims before changing code.
8. The product emphasizes transcript-wide review rather than diff-only review, allowing feedback on planning, architecture, implementation and debugging.
9. Public docs describe local-first custody: session content does not go to the Catallaxy backend; provider CLIs use the user's own provider subscriptions.
10. Personas can receive additional bounded context ("lenses") and direct-address questions.
11. Public docs describe a persona/lens/package exchange (Freehold) as a marketplace/community layer.
12. Public terms describe best-effort credential redaction before transcript content is passed to an observer provider.

## Reddit feedback captured

The supplied 2026-10-05 thread contained two actionable signals at research time:

- a user specifically wanted to see how observers report on an agent and its subagents across several projects;
- a user asked whether observers consume tokens/usage and whether they prevent wasted work. The creator clarified consultations consume the user's normal subscription allowance, manual mode is the default, and auto mode consults after every returned prompt.

These are treated as user-feedback requirements, not universal market consensus.

## Reconciliation with existing Agent Work OS

Do not create a separate product repository. Agent Work OS already provides the necessary foundations:

- RE-370: multi-provider adapters and shared-Brain handoff boundary;
- RE-372: persistent Shared Rooms, named agents, bounded shared transcript context, exact provenance, governed tool approvals and receipts;
- RE-359: separate builder/verifier roles, bounded usage evidence and restart-safe coordination concepts;
- base platform: local daemon, normalized session events, persistence and operator UI.

The donor therefore becomes a **review-council capability** inside the same control plane.

## Capability decisions

### MATCH

- passive read-only reviewers;
- persona x model binding;
- transcript-aware review rather than diff-only review;
- manual consultation and explicit automatic mode;
- severity/alert threshold;
- multi-reviewer consensus signal;
- persistent project/room association;
- local provider credentials stay with the local runtime.

### IMPROVE

- consensus is never represented as correctness; every alert carries `requiresIndependentVerification=true` until a separate verifier receipt exists;
- explicit parent-agent/subagent lineage is first-class review context;
- estimated per-observer and total-consult token budgets are enforced before dispatch, not merely displayed after usage;
- automatic review requires an explicit opt-in instead of being an incidental setting;
- deterministic immutable digests bind consultation plan, observation and independent-verification receipts;
- restart reconciliation marks in-flight review as interrupted rather than assuming completion;
- capabilities are allowlisted as read-only at the domain boundary.

### NEW

- exact source anchors for each observation so claims can be traced to transcript facts;
- independent verifier identity must differ from the observer identity;
- decisive verified/rejected dispositions require evidence references;
- bounded lineage graph checks for missing parents, cycles, node count and depth;
- later Phase B should integrate provider usage receipts with RE-359 benchmark/cost evidence instead of trusting advertised savings.

### OMIT / LATER

- Catallaxy branding/cast/personas/artwork/UI metaphors;
- Freehold-like marketplace until local governance/security/versioning is proven;
- illustrator/image personas until text review is verified end to end;
- Windows bridge until the local runtime path is proven;
- native macOS shell until browser/API/runtime behavior is certified;
- any hidden/private Catallaxy implementation detail.

## Phase A implemented on this branch

`services/control-api/src/review-council.js` defines `review-council/v1` with:

- strict persona, binding and council normalization;
- read-only capability allowlist;
- manual-default / auto-opt-in policy;
- session-lineage normalization with cycle, parent, size and depth gates;
- deterministic consultation planning from bounded transcript + lineage;
- per-observer and total estimated input-token budget refusal;
- normalized observations with severity, confidence, source anchors and claim digest;
- deterministic exact-claim consensus clustering;
- alert projection that never equates consensus with verification;
- independent verification receipts and self-certification refusal;
- consultation receipts and restart interruption reconciliation.

`services/control-api/test/review-council.test.js` exercises positive and negative paths for each of those invariants.

## Explicit non-claims

This Phase A does **not** claim Catallaxy parity, live provider review execution, real token billing accuracy, transcript hook installation, credential scanner parity, API integration into Shared Rooms, UI, native desktop packaging, marketplace behavior, deployment, browser/device UAT or production readiness.

## Next gated slice

Only after exact-head repository CI is green:

1. persist councils/bindings/consultations inside Shared Rooms without duplicating authoritative session state;
2. expose authenticated APIs for council configuration and manual consultation;
3. dispatch read-only reviewer sessions through existing local provider adapters;
4. ingest normalized provider usage and session lineage facts;
5. attach observation/verification receipts to room history;
6. add an operator UI showing observers, budgets, lineage, alerts and verification state;
7. run real-provider UAT with Claude/Codex/Gemini independently where available;
8. only then evaluate Electron/macOS packaging and automatic consultation cadence.
