# vllmops 0.5.0 donor → Bare-Metal Model Supervisor for the Local/Team Inference Gateway

Status: **SOURCE → EVIDENCE → RECONSTRUCTION → SPECIFIED → SHIPPING CONTRACT READY / BLOCKED_WIP**  
Canonical repo: `rrahul0904/agent-work-os`  
Canonical coordination issue: `#86`  
Companion inference-gateway dossier: `docs/reverse-engineering/anyscale-local-team-inference-gateway.md`  
Research snapshot: 2026-10-09

## Source set

User-supplied source:
- https://lnkd.in/p/gCuWrTSX

Resolved source:
- Matteo Benvenuti LinkedIn launch post for **vllmops 0.5.0**.

First-party/public implementation evidence:
- https://github.com/Freim32/vllmops
- exact upstream head inspected: `a374b26e0c6f61b921fa6843ed6f279ca7c5445c`
- v0.5.0 release date: 2026-10-02
- license: Apache-2.0

The implementation is licensed for reuse under Apache-2.0 obligations, but Agent Work OS should still prefer independently authored contracts and runtime adapters so the product boundary remains provider/runtime neutral and does not inherit donor UI/architecture constraints accidentally.

## What problem the donor solves

Running several vLLM servers directly on a bare-metal GPU machine tends to accumulate operational state outside a control plane:

- model launch flags live in shell history;
- one terminal/tmux session exists per model;
- a process believed to be stopped may still own GPU memory;
- applications must know individual model ports;
- local logs, process state, GPU state and vLLM metrics are fragmented;
- teams often reach for Kubernetes/Prometheus/Grafana even when one host does not need that operational weight.

vllmops turns that into a small local control plane:

`Git model config -> lifecycle action -> detached vLLM process -> health/metrics -> TUI/CLI -> generated LiteLLM route`

That pattern is directly useful to Agent Work OS, but only as a **model execution-plane layer**. It is not a replacement for #81 machine capability truth or #86 request routing/governance.

## Donor product reconstruction

### 1. Declarative model catalog

One model is represented by one YAML file. The repository/config is intended to be kept in Git. Configuration covers model/runtime arguments, environment references, host/port and GPU selection.

A broken sibling YAML is isolated rather than making every other model unusable. Duplicate names/ports are surfaced as invalid catalog entries.

### 2. Model lifecycle

The service layer exposes start, stop, restart, status, health and logs. The low-level lifecycle module:

- launches a detached child process in its own POSIX session;
- persists a PID file;
- redirects output to model logs;
- probes process existence;
- sends `SIGTERM` and later escalates to `SIGKILL` after a timeout;
- rotates or appends logs.

This is a useful baseline, but a PID alone is not strong process ownership evidence because PIDs can be reused.

### 3. Profiles / groups

Profiles are named sets of models. Bulk lifecycle operations can start/stop/restart members in parallel. Invalid entries do not need to prevent unrelated valid siblings from operating.

### 4. Readiness and metrics

The donor uses the vLLM HTTP surface for health and metrics, then projects model/GPU observations into the CLI/TUI. The important transferable behavior is direct local observability without requiring an external monitoring stack for a small host.

### 5. Doctor / preflight

The donor validates prerequisites such as runtime availability and obvious local conflicts before operators discover them through failed launches.

For Agent Work OS this should become a passive, evidence-bearing `RuntimeDoctorReport`, not an implicit execution permission.

### 6. Single gateway endpoint

v0.5.0 adds a LiteLLM gateway. Running eligible models are transformed into a generated LiteLLM model list, giving clients one OpenAI-compatible endpoint and one logical model name instead of host-port knowledge.

This is particularly relevant to #86, but the donor's gateway lifecycle is not sufficient as our final design.

## Important donor limitations / failure evidence

### Process identity

The donor stores PID files and probes whether a PID exists. That answers process existence, but not whether the PID still belongs to the exact process that the supervisor originally started.

Agent Work OS must bind ownership to an execution identity plus stronger observed identity such as process start time, executable/command digest or equivalent platform evidence before signaling or killing it.

### `running` is weaker than `ready`

A spawned process can be alive while a model is still loading/warming or while the serving endpoint is unhealthy. Agent Work OS must keep process state, model readiness and route eligibility separate.

### Gateway refresh interruption

The donor documentation explicitly notes that automatic gateway refresh is implemented by respawning the LiteLLM proxy. In-flight traffic may be dropped and the endpoint can be unavailable briefly during that transition.

For our implementation, a route update needs a receipt that states what happened to in-flight requests. Prefer runtime/dynamic route mutation or a blue/green/drain strategy where supported; do not silently label a process restart as zero-downtime.

### Stale routes after model death

The donor documentation also notes that a model that dies on its own may remain in the existing LiteLLM model list until the gateway is reconciled/restarted. That is exactly the kind of split-brain route truth that Agent Work OS should eliminate.

### GPU declaration is not GPU scheduling

A model naming one or more GPUs does not prove memory headroom, co-residency safety, performance or runtime support. Same-GPU sharing must be a resource/evidence decision bound to #81, not a string comparison over `CUDA_VISIBLE_DEVICES`.

## Feedback captured from the supplied LinkedIn thread

Only accessible public comments are treated as evidence; hidden comments are not invented.

Material requests/questions visible in the supplied thread:

- make multiple models on one GPU easier;
- understand tokens/sec impact when models share a GPU;
- support hot reload and measure warm-up time;
- handle heterogeneous NVIDIA/mobile/AMD hardware;
- when a model is stopped/loading, return a clear bounded error or route through an explicitly permitted fallback instead of hanging;
- log which actual model served each request for team/cost attribution;
- consider on-demand/dynamic routing;
- consider LoRA or standby-memory approaches;
- add pause semantics;
- support multiple model types rather than one hard-wired runtime family.

These become product requirements or investigation items, not inherited feature claims.

## Current ecosystem check

### vLLM Sleep Mode

Current vLLM documentation exposes Sleep Mode, which can release most GPU memory and later wake the model server without a full container/server teardown. Current docs state CUDA and ROCm support.

Product implication: model lifecycle should include a runtime-capability-gated `sleeping` state and wake receipt. `sleep` is not synonymous with `stop`, and a woken process is not route-ready until health/readiness is observed again.

### Dynamic LoRA

Current vLLM documentation supports dynamically loading LoRA adapters at runtime. The same documentation warns this feature introduces security risk and should only be used in an isolated, fully trusted environment.

Product implication: dynamic adapter mutation is **deferred by default** and must never be enabled as an ungoverned convenience feature.

### LiteLLM runtime routing/configuration

Current LiteLLM documentation supports load balancing, cooldowns, retries/fallbacks, routing groups, runtime configuration updates, model management and actual deployment attribution in request/spend logs.

Product implication: before accepting donor-style whole-proxy respawn as our architecture, the LiteLLM adapter must evaluate a dynamic update path. If dynamic mutation cannot satisfy exact route/drain/rollback semantics, use a versioned blue/green proxy strategy instead.

## Internal dedupe / canonical placement

Do **not** create a separate vllmops clone or standalone local-model product.

The canonical chain is:

`#81 machine capability truth -> model manifest -> placement plan -> execution grant -> owned model process -> readiness/metrics -> healthy route -> #86 inference plan/grant -> inference stream -> #66/#86 request and cost receipt`

Responsibilities stay separate:

- **#81 Local Compute Router**: can this workload plausibly run on this machine, under what constraints, and is execution authorized?
- **Bare-Metal Model Supervisor (this donor)**: for an already-authorized placement, is the exact model process owned, alive, ready, healthy and safely routable now?
- **#86 Local/Team Inference Gateway**: which eligible lane should serve this request under privacy/cost/latency/cache/capability/fallback policy?
- **#66 telemetry**: what actually happened to the request/session, which backend served it, and what measurable usage/cost/latency evidence exists?

## Product target

Build an Agent Work OS **Bare-Metal Model Supervisor** as a provider-neutral execution-plane capability under #86:

`ModelRuntimeManifest -> ModelPlacementPlan -> ModelExecutionGrant -> ModelProcess -> readiness -> ModelRouteState -> GatewayRefreshReceipt`

A model must never become a healthy inference lane merely because a process exists.

## MATCH / IMPROVE / NEW / OMIT / INVESTIGATE

### MATCH

- declarative model catalog;
- named model groups/profiles;
- start/stop/restart/status/health/log lifecycle;
- direct health/metrics collection;
- lightweight single-host preflight/doctor;
- invalid-model isolation;
- one logical gateway endpoint;
- idempotent lifecycle expectations;
- generated config should contain secret references, not resolved secret literals.

### IMPROVE

- owned process identity stronger than PID-only tracking;
- explicit process/readiness/route state separation;
- resource-aware placement bound to fresh #81 evidence;
- `starting|loading|warming|ready|draining|sleeping|stopped|failed|orphaned|unknown` lifecycle;
- typed stopped/loading/unhealthy client behavior;
- graceful drain before stop/restart;
- prewarm/warm-up timing receipts;
- runtime-capability-gated sleep/wake/standby;
- automatic unhealthy-route quarantine and recovery;
- dynamic or blue/green gateway refresh with explicit in-flight disposition;
- actual backend attribution per request;
- cost/latency/cache/usage evidence wired into #66/#86;
- model/runtime/config/machine digests on receipts;
- missing/stale metrics stay unknown rather than zero;
- adapter boundary rather than mandatory vLLM/LiteLLM lock-in.

### NEW

- `model-runtime-manifest/v1`;
- `model-placement-plan/v1`;
- `model-execution-grant/v1`;
- `model-process-receipt/v1`;
- `model-route-state/v1`;
- `gateway-refresh-receipt/v1`;
- `runtime-doctor-report/v1`;
- `inference-runtime-metrics/v1`;
- per-model supervisor lease;
- orphan/restart reconciliation contract;
- explicit warm/sleep/drain lifecycle receipts;
- route-health circuit state bound to exact model-process identity.

### OMIT / DEFER

- donor TUI clone, branding, copy or trade dress;
- Kubernetes replacement;
- Prometheus/Grafana replacement for large/fleet deployments;
- automatic model acquisition in the first implementation slice;
- arbitrary runtime LoRA updates in untrusted environments;
- a custom inference gateway when a governed LiteLLM adapter satisfies the contract;
- cluster autoscaling and multi-node scheduling before single-host correctness is certified;
- performance/parity claims inherited from donor examples.

### INVESTIGATE before real-runtime implementation

- exact current vLLM sleep/wake behavior by runtime version and GPU platform;
- safe LoRA lifecycle and trust boundary;
- LiteLLM dynamic model/config update APIs versus process restart;
- same-GPU co-residency with real memory headroom and throughput evidence;
- NVIDIA/ROCm/heterogeneous-host observation adapters;
- startup/compile-cache/warmup telemetry and exact readiness boundary;
- model-server process identity evidence available on supported host platforms.

## Stage-9 behavior contracts

### `ModelRuntimeManifest`

Required semantics:

- stable model/lane id;
- model source and exact revision where available;
- runtime adapter and exact runtime version/revision;
- served API semantics and capabilities;
- bind host/port;
- requested device/GPU set and runtime topology (`tp`, `pp`, etc. where applicable);
- artifact/memory expectations only when evidenced;
- health and metrics endpoints;
- startup/warm-up policy;
- environment **references**, never persisted raw secret values;
- canonical digest.

### `ModelPlacementPlan`

Pure planning only:

- exact #81 machine-profile digest;
- exact model-manifest digest;
- device/port conflicts;
- known/unknown memory headroom;
- co-residency policy;
- `fit|degraded|refuse|unknown` result plus typed reasons;
- no process-spawn authority.

### `ModelExecutionGrant`

- exact manifest/placement/machine/policy digest binding;
- bounded expiry;
- one execution identity;
- exact allowed runtime/process/gateway effects;
- cannot authorize `refuse` or silently coerce unresolved `unknown` to fit;
- cannot silently switch model/runtime/device;
- contains no raw secret.

### `ModelProcessReceipt`

- exact grant/execution/model/runtime/machine identity;
- owned process identity stronger than PID alone;
- redacted command/config digest;
- assigned devices and port;
- process start/end;
- observed readiness transitions;
- observed warm-up duration when measurable;
- termination reason;
- bounded log/metrics references;
- stale/orphan/restart reconciliation outcome;
- immutable digest.

### `ModelRouteState`

- logical model name;
- exact backend/model-process receipt binding;
- lifecycle state: `loading|ready|draining|sleeping|stopped|failed|stale`;
- health evidence and freshness;
- route eligibility reason;
- route/config revision digest;
- fallback-policy reference when one exists;
- no `ready` without observed backend readiness.

### `GatewayRefreshReceipt`

- old/new route-config digests;
- config prevalidation outcome;
- old/new backend identities;
- cutover/drain behavior;
- in-flight request disposition;
- readiness/rollback outcome;
- bounded error evidence;
- immutable digest.

### `RuntimeDoctorReport`

Passive observations only:

- runtime executable/version;
- model/auth-reference prerequisites without exposing secret values;
- host/GPU/runtime capability evidence;
- port/device conflicts;
- stale/owned/orphan process observations;
- storage/runtime-path readiness;
- gateway conflicts;
- typed `pass|warn|fail|unknown` findings with provenance and freshness.

### `InferenceRuntimeMetrics`

Every metric must carry source/provenance and observation time. Examples when actually available:

- GPU utilization/memory;
- KV-cache usage;
- running/waiting requests;
- TTFT;
- prompt/output tokens;
- throughput;
- cache/prefix reuse;
- model/backend identity.

Missing metrics are `unknown`, never invented as zero.

## Required negative / recovery tests

1. malformed model definition does not block unrelated valid definitions;
2. duplicate port refuses only the affected placement;
3. exclusive-device collision refuses the affected placement;
4. missing/stale resource evidence yields `unknown`, never fit;
5. `ModelPlacementPlan` alone cannot spawn;
6. grant for model A cannot spawn model B;
7. changed model/runtime/machine/config digest invalidates a stale grant;
8. PID reuse cannot make an unrelated process appear owned or eligible for termination;
9. daemon restart reconciles owned healthy, stale and foreign/orphan processes without fabricated success;
10. concurrent starts for one model yield at most one owned supervisor lease;
11. spawn success is not readiness success;
12. readiness/warm-up timeout is typed and receipt-backed;
13. port/device state is rechecked immediately before effectful launch/cutover;
14. signal escalation can target only the exact owned execution identity;
15. group partial failure returns truthful per-model receipts and preserves successful siblings;
16. stop/restart retries are deterministic/idempotent;
17. failed/unhealthy backend becomes route-ineligible after the configured health threshold;
18. stopped/loading model returns a bounded typed error or an already-authorized #86 fallback, never indefinite hanging;
19. fallback cannot cross a privacy/provider/residency boundary absent from the #86 grant;
20. gateway update is prevalidated before active cutover;
21. interrupted in-flight request is recorded as interrupted/partial, never full success;
22. secret values never appear in persisted command/config/log/receipt payloads;
23. missing metric remains unknown, not zero;
24. inference receipt identifies the actual backend/model process when observable;
25. same-GPU co-residency is never accepted merely because two manifests name the same device;
26. sleep/wake cannot make a route ready before post-wake readiness is observed;
27. an untrusted dynamic-LoRA request is refused by default;
28. a gateway/model crash followed by supervisor restart never fabricates an uninterrupted success.

## Implementation sequence

Implementation remains WIP-gated. When a BUILDING slot is available, execute bounded vertical slices in this order.

### B0 — deterministic supervisor domain + fake adapters

- implement the contracts/state machine;
- fake process adapter;
- fake gateway adapter;
- fake resource/metrics observer;
- deterministic restart/orphan fixtures;
- no network, vLLM install, model download or GPU dependency.

### B1 — explicit local vLLM adapter

- already-installed explicitly configured `vllm` executable only;
- argv-array process launch without shell interpolation;
- exact owned-process identity;
- health/readiness and metrics observation;
- no installer or implicit model acquisition.

### B2 — placement, groups and reconciliation

- bind fresh #81 machine evidence;
- device/port conflict checks;
- group partial-success receipts;
- restart/orphan reconciliation;
- same-GPU remains fail-closed until real evidence is available.

### B3 — LiteLLM gateway adapter

- only healthy/eligible model routes;
- dynamic route mutation when it satisfies the contract, otherwise blue/green cutover;
- explicit drain/fallback/cooldown behavior;
- no inherited full-proxy-respawn downtime claim.

### B4 — Agent Work OS projection

Expose model/process/route/health/metrics truth through existing machine/control surfaces rather than cloning the donor TUI.

### B5 — real GPU certification

Pin exact host/GPU/model/runtime revisions and test:

- cold start;
- warm start;
- crash/restart;
- stale process/route reconciliation;
- same-GPU experiment;
- sleep/wake where supported;
- partial profile failure;
- gateway refresh under traffic;
- resource pressure/OOM behavior;
- exact-head evidence receipts.

### B6 — #86 integration

A `local_machine` or `team_gpu` lane is eligible only from a fresh `ready` `ModelRouteState`. Feed actual-backend, latency/cache/token/cost observations into #86/#66 receipts.

## Verification ladder

No `SHIPPED` or production claim until the relevant level has evidence:

`Static -> Unit -> Contract -> Fake integration -> Restart/persistence -> Real local vLLM -> Real GPU -> Gateway failure/cutover -> Client request UAT -> Load/co-residency -> Exact-SHA CI/receipts -> Tracker truth`

Passing the domain tests does not prove GPU correctness. A healthy local process does not prove gateway/fallback correctness. A working gateway does not prove same-GPU efficiency, client quality parity or production readiness.

## Tracker / WIP truth

This donor is **not a new project**. It is a source/capability addendum to issue `#86` and depends on `#81` for resource truth.

The current portfolio has too many concurrent BUILDING lanes for another uncontrolled feature branch. Research, specification and Shipping Contracts can advance now; implementation begins only when a bounded BUILDING slot is available or #86 is explicitly promoted as a dependency lane.

## Explicit non-claims

No vllmops parity. No donor TUI clone. No GPU runtime implementation yet. No same-GPU performance claim. No hot-reload certification. No sleep/wake certification. No dynamic-LoRA certification. No LiteLLM zero-downtime claim. No production deployment. No new tracker ID.