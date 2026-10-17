# RigSpark donor → proof-bearing Local Compute Router

Status: **SPECIFIED / BLOCKED_WIP**  
Tracker ID: **pending canonical reconciliation**  
Coordination issue: **#81**  
Primary user source: https://www.reddit.com/r/vibecoding/s/pWIkdQHcZa

## 1. Source manifest

- Reddit launch: `r/vibecoding` — “Rigspark now support image and video models”.
- First-party site: https://www.rigspark.si/
- Public source: https://github.com/shashankswe2020-ux/rigspark
- Donor snapshot inspected: `bdb1dc39d1cb0df8661c27d64a32d14537f8a651` (release 2.4.0, 2026-10-08).
- Donor license at that snapshot: MIT.
- Primary implementation evidence inspected: `docs/specs/image-video-generation.md`, generation catalog/runtime code paths, current release commits and public site copy.

This is a clean-room capability-donor study. Agent Work OS should not copy RigSpark branding, visual design, model catalog, schema, source structure, tests or implementation details by default.

## 2. Evidence classification

### Observed / first-party documented

RigSpark publicly implements or documents:

- hardware-aware local model advice from RAM/GPU/disk facts;
- deterministic offline model fit advice rather than requiring a remote recommendation service;
- explicit yes/slow/no-style fit semantics;
- multiple local text-runtime integrations;
- local image and video generation through a separately installed ComfyUI;
- image/video model manifests with pinned revisions, byte sizes and SHA-256 digests;
- fail-closed workflow rules for media generation: built-in workflows, allowlisted core local nodes, no Comfy partner-cloud credentials, and loopback-only endpoints;
- generation memory advice that can distinguish resident fit from staged/offloaded execution;
- `unknown` throughput when no sourced benchmark exists;
- resumable weight acquisition while retaining final exact-size and cryptographic verification;
- runtime-specific handling discovered through live first-party testing, including Apple MPS behavior and interrupted downloads.

### Reddit feedback state

The supplied thread snapshot exposes no substantive independent comment discussion. Do not invent sentiment, requested features or validation from Reddit.

### First-party failure evidence

The donor specification records real engineering failure modes worth reconstructing behaviorally:

- a dropped CDN connection can discard large downloads without resumable acquisition;
- media workloads can need materially more than their raw weight size because of activations/encoders;
- an execution path can fit only through explicit swapping/offload behavior;
- a runtime/device-specific sampler can diverge on Apple MPS;
- a local process being reachable is not enough unless readiness and result states are verified;
- cached artifacts must not be trusted merely because a filename still exists.

These are first-party engineering observations, not independent benchmark proof for Agent Work OS.

## 3. Workflow reconstruction

The transferable donor workflow is:

1. observe machine resources;
2. select a workload/model;
3. calculate a bounded fit verdict from explicit evidence;
4. identify a supported runtime/execution path;
5. verify model/artifact/runtime prerequisites;
6. acquire or locate exact artifacts;
7. launch/submit locally;
8. observe runtime result;
9. retain enough evidence for repeatability and failure diagnosis.

For Agent Work OS, this becomes:

`MachineProfile -> WorkloadManifest -> CapabilityPlan -> PolicyDecision -> ExecutionGrant -> AdapterRun -> OutcomeReceipt`

The Agent Work OS version deliberately separates feasibility, permission and observed outcome.

## 4. Competitive boundary

### LM Studio

Current LM Studio provides local model loading, configurable GPU offload, memory estimation without loading, headless serving, local APIs, and selection across local/remote/cloud execution. This means “model picker + memory estimate + local server” is not a defensible standalone product thesis for us.

### Ollama

Ollama provides a mature local-model runtime and broad GPU support. It should be treated as a future execution adapter, not something Agent Work OS should reimplement.

### ComfyUI

ComfyUI is a mature local graph runtime for generative media. The useful boundary is a constrained local adapter with our own allowlisted workflow contract and evidence receipts, not a replacement media graph engine.

### Product conclusion

Do not build another local-AI desktop application. Build scheduler-grade **local compute truth** that can choose between developer-owned machines, local runtimes and later provider lanes while preserving explicit unknowns and authority boundaries.

## 5. Internal donor audit

Canonical destination: `rrahul0904/agent-work-os`.

Reuse these existing foundations:

- local daemon machine identity and advertised adapter capabilities;
- governed provider/harness policy concepts from RE-359;
- Fleet work separating transport state from execution truth;
- Mobile Agent Workbench resource/capability-preflight direction;
- Shipping OS exact-SHA and evidence-gated release model.

Do not create a new RigSpark clone repository or another source of machine/session truth.

## 6. Product thesis

### Local Compute Router

Agent Work OS should answer four distinct questions:

1. **What is observed?** — machine resources, runtime availability, freshness and provenance.
2. **Can it plausibly run?** — deterministic capability plan using only explicit evidence.
3. **May it run?** — separate exact-input authorization/policy grant.
4. **What actually happened?** — measured runtime receipt bound to machine/workload/run identity.

A capability verdict never implies authority. An approval never turns unknown resource evidence into known capability. A successful historical run never silently rewrites a new plan as safe.

## 7. MATCH / IMPROVE / NEW / OMIT

### MATCH

- machine resource profiling;
- text/image/video workload fit;
- explicit staged/offload execution path;
- local runtime discovery;
- artifact integrity/provenance metadata;
- local media runtime capability.

### IMPROVE

- provenance + `observedAt` on each resource observation;
- first-class `unknown` instead of inferred zero/defaults;
- explicit stale-evidence policy;
- separate fit plan and execution grant;
- exact machine/workload/policy digest binding;
- project/work/task/run identity binding;
- measured outcomes append evidence without mutating historical plans;
- scheduler routing remains policy-driven rather than hidden in a launcher.

### NEW

- shared `local-compute-capability/v1` contract for text, embedding, image and video workloads;
- deterministic `fit | degraded | refuse | unknown` verdict;
- exact unknown-field and reason codes;
- offload/stage support must be declared by the runtime/workload contract;
- explicit `ExecutionGrant` tied to exact `CapabilityPlan` digest;
- local endpoint restrictions can be non-bypassable policy;
- later cross-machine scheduler comparison using the same proof-bearing contract.

### OMIT / defer

- RigSpark UI/branding/assets;
- copying its model catalog;
- another desktop LLM launcher;
- automatic large-weight acquisition in Phase A;
- arbitrary/custom downloaded ComfyUI workflows;
- cloud/paid Comfy partner nodes;
- throughput estimates without measured/source evidence;
- production execution before real-machine certification.

## 8. Phase A — `local-compute-capability/v1`

Phase A is pure domain logic and deterministic tests. It performs no shell, network, Git, provider, model-download or runtime side effect.

### MachineProfile

Required semantics:

- typed `platform` and `arch`;
- system-memory observation: `totalBytes`, optional `availableBytes`, provenance, `observedAt`;
- zero or more compute-device observations: type/vendor/discrete-or-unified, optional total/free memory, provenance, `observedAt`;
- disk-free observation with provenance/freshness;
- declared local runtime/capability facts;
- stable canonical digest;
- absent value remains absent; `0` is a real observed value and is never equivalent to unknown.

### WorkloadManifest

Required semantics:

- stable workload/model id;
- kind: `text | embedding | image | video`;
- target runtime/adapter identity;
- known `residentBytes`, `largestStageBytes`, `diskBytes`, and optional additional/context-memory requirement;
- explicit `supportsOffload` and `supportsStageSwap` flags;
- optional integrity requirements with exact artifact digests/revisions;
- endpoint policy such as `loopback-only` for local-service workloads;
- stable canonical digest.

### CapabilityPlan

Verdicts:

- `fit` — known requirements fit the applicable resource budget with configured headroom;
- `degraded` — only an explicitly supported offload/stage-swap path fits;
- `refuse` — known requirements cannot fit a supported path;
- `unknown` — a required workload or machine fact is absent/stale/unsupported.

The plan must include:

- machine/profile/workload digests;
- exact evaluation inputs and headroom policy;
- machine-readable reasons;
- explicit unknown fields;
- no execution side effect;
- no execution authorization.

### ExecutionGrant

A grant is a separate pure contract in Phase A:

- references exact capability-plan digest;
- references explicit authority/policy decision;
- refuses `refuse` and unresolved `unknown` plans;
- requires explicit degraded-mode allowance for `degraded`;
- cannot override integrity requirements;
- cannot override `loopback-only` for local-only runtimes;
- includes bounded validity/expiry and exact execution identity;
- is single-use/idempotent by exact execution identity;
- contains references/digests rather than secret literals.

## 9. Required tests

Positive:

- all-resident workload fits a known budget;
- supported stage-swap path produces `degraded` when full residency does not fit;
- exact canonical inputs reproduce the same digests;
- valid policy creates a grant for a `fit` plan;
- explicit degraded authorization can grant a `degraded` plan.

Negative/recovery:

- missing memory observation -> `unknown`;
- zero free memory != unknown free memory;
- stale required observation -> `unknown`/review according to explicit freshness policy;
- missing workload size -> `unknown`;
- full workload over budget and no explicit offload/staging -> `refuse`;
- largest required stage fits nowhere -> `refuse`;
- unsupported architecture/runtime fails closed;
- fit plan alone cannot execute;
- mismatched/stale plan digest cannot be granted;
- ordinary approval cannot grant `unknown` or `refuse`;
- degraded plan without degraded allowance is refused;
- integrity-required artifact without complete digest/revision metadata is not grantable;
- local-only service rejects non-loopback endpoint;
- profile/workload change changes plan digest;
- expired grant cannot be silently replayed after restart.

## 10. Later phases

### Phase B — daemon observation

Collect host OS/RAM/disk and runtime facts locally with explicit provenance/freshness. GPU discovery remains pluggable; unsupported discovery is represented as unknown rather than fabricated.

### Phase C — scheduler integration

Use exact capability-plan receipts to route eligible work among known developer-owned machines. Keep feasibility separate from provider cost/policy/approval.

### Phase D — local text runtimes

Adapters to already installed local runtimes first. Do not turn Agent Work OS into a universal installer.

### Phase E — local media runtime

Bounded loopback ComfyUI adapter with built-in allowlisted workflow contracts, pinned/integrity-checked artifact manifests and explicit runtime readiness/result receipts.

### Phase F — measured performance

Append latency/throughput/memory observations keyed by exact machine/runtime/workload revision. No inferred marketing estimate; unknown remains unknown until evidence exists.

### Phase G — recovery/device certification

Real Apple Silicon/NVIDIA/CPU-only matrix; stale profile, process loss, low-memory pressure, runtime restart, interrupted acquisition and replay exercises.

## 11. WIP gate

At this intake, Agent Work OS already has more active BUILDING branches than the roadmap’s intended maximum. This donor therefore advances to **SPECIFIED** with a committed Shipping Contract, but feature implementation remains **BLOCKED_WIP** until a build slot is freed or an active lane is explicitly stopped/reclassified.

This is intentional governance, not a completion claim. The contract exists so an eligible autonomous campaign can start without rediscovering product boundaries.

## 12. Tracker rule

The newest canonical Library tracker is reconciled through RE-384, while newer GitHub work has already used later working IDs. Do not invent a RigSpark RE number. Assign only after canonical reconciliation.

## 13. Completion evidence ladder

`SPECIFIED -> BUILDING -> RUNNABLE -> exact-head CI -> real-machine UAT -> recovery certification -> integration proof -> release evidence`

No RigSpark parity, local-runtime certification, ComfyUI execution, model-download support, throughput benchmark, deployment, production readiness or `SHIPPED` claim exists from this specification alone.
