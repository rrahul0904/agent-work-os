# Anyscale coding-inference donor → Local/Team Inference Gateway

Status: **SOURCE → EVIDENCE → RECONSTRUCTION → SPECIFIED → SHIPPING CONTRACT READY**  
Tracker ID: **pending reconciliation**  
Canonical repo: `rrahul0904/agent-work-os`  
Coordination issue: `#86`  
Research snapshot: 2026-10-09

## Source set

User-supplied source:
- https://lnkd.in/p/gn8DzCrA

Resolved/public first-party sources:
- LinkedIn post by Kunling Geng describing the blueprint and benchmark highlights.
- https://www.anyscale.com/blog/run-coding-agents-on-your-own-gpus
- https://github.com/anyscale/llm-serving-for-coding-agents
- donor head inspected: `95af323db8951d1a7e5ea588a4e8c706ae15c115`

Rights boundary: the public GitHub repository currently reports no license metadata. Treat source code/configuration as research evidence only. Do not copy donor implementation, branding, assets, YAML/Python structure, prompts, or private product internals unless licensing is explicitly clarified later.

## Product reconstruction

The donor is a five-part deployment pattern for serving coding-agent LLMs:

1. deploy an open-weight model using vLLM behind Ray Serve LLM;
2. expose client-compatible endpoints for Claude Code, Codex and Cursor;
3. tune coding-agent workloads for repeated long prompts, prefix/KV reuse, quantized KV, CUDA graphs, speculative decoding and autoscaling;
4. route between a self-hosted/open model and a hosted model using a gateway;
5. distribute centrally managed client configuration to a team.

Documented endpoint expectations:

| Client | Endpoint semantic |
|---|---|
| Claude Code | `POST /v1/messages` |
| Codex | `POST /v1/responses` |
| Cursor | `POST /v1/chat/completions` |

The transferable product idea is therefore not Anyscale itself. It is a **provider-compatible inference gateway for coding agents that can choose among local, shared-team, remote open-model and hosted-provider lanes while preserving privacy, capability, cost, latency, cache and authorization truth**.

## Workload insight

Coding agents are structurally different from ordinary short chat. They repeatedly resend system instructions, repository context, tools, diagnostics and conversation history. This creates:

- prefill-heavy traffic;
- repeated prefixes across successive turns;
- long-lived session affinity opportunities;
- latency sensitivity at time-to-first-token;
- bursty team concurrency;
- a meaningful difference between raw tokens/sec and goodput under latency SLOs.

The donor therefore makes prefix/KV reuse and cache-aware routing first-class performance concerns.

## Evidence and benchmark scope

First-party material reports measured improvements on specific model/runtime/hardware paths, including:

- CUDA graphs: about `15.9 → 45.6 tok/s` in one client-observed test;
- speculative decoding: roughly `65 → 121 tok/s` in one measured path;
- compile-cache restoration: roughly `48.5 → 6.0 s` on the cited vLLM path;
- CPU KV-cache tiering on GLM-5.2: cached prompt fraction `6.1% → 74.9%`, median TTFT `48.4 → 9.2 s`, and request throughput `0.0625 → 0.2367 req/s`.

Critical correction from the supplied LinkedIn comments: the GLM-5.2 CPU-KV result used **one node with 8 RTX PRO 6000 GPUs at TP=8**, not a single GPU. The separate approximately `$58/developer-month` planning example assumes 50 registered developers sharing one GPU. These are different scenarios and must not be merged into one claim.

Cost projections are planning assumptions, not independently audited TCO or quality-equivalent replacement proof.

## Feedback translated into requirements

The substantive LinkedIn discussion highlights three requirements for our product:

1. repeated-prefix/cache reuse can matter more than peak decode throughput for agent workloads;
2. startup/deployment mechanics such as compile-cache restoration materially affect production operability;
3. economics are irrelevant if self-hosted model quality does not meet the actual engineering workload.

These become acceptance criteria rather than marketing claims.

## Internal donor audit / dedupe

Canonical destination: `rrahul0904/agent-work-os`.

Do not create another standalone model launcher or Anyscale clone.

Relevant existing Agent Work OS capabilities:

- `#81` RigSpark donor → Local Compute Router: machine/workload capability truth and execution grants;
- `#16` / RE-359 TauCode donor: provider/cost-aware execution policy and usage receipts;
- `#66` coding-agent session/token/cost telemetry;
- machine/daemon/adapter/session control-plane;
- Shipping OS exact-SHA evidence and release gates.

Relationship to #81:

- Local Compute Router answers: **can this workload plausibly run here, and is it authorized?**
- This donor adds: **which inference lane should serve this exact coding-agent request, under what privacy/cost/latency/cache/capability policy, and what evidence proves the routing/outcome?**

## Product thesis

Build a provider-neutral **Local/Team Inference Gateway**:

`agent request -> normalize -> capability/policy preflight -> candidate lanes -> deterministic plan -> execution grant -> endpoint adapter -> stream -> receipt -> routing evidence`

Supported lane classes:

1. `local_machine`
2. `team_gpu`
3. `remote_open_model`
4. `hosted_provider`

The gateway may prefer one lane, but security/capability constraints always outrank cache affinity or cost preference.

## Clean-room capability decisions

### MATCH

- native coding-agent API compatibility;
- streaming;
- local/self-hosted/open-model execution;
- hosted fallback where explicitly allowed;
- cache-aware routing concepts;
- coding-agent trace replay for benchmarking;
- managed team configuration.

### IMPROVE

- provider/runtime neutral rather than Anyscale-specific;
- capability evidence from #81 required before local/team eligibility;
- privacy, capability, authorization, cost, latency, quality and cache remain separate dimensions;
- unknown facts remain unknown;
- route/fallback reasons are persisted in receipts;
- policy, model and runtime revisions are digest-bound;
- successful inference never implies quality parity;
- no fallback can silently leak private repository context to a disallowed provider;
- measured telemetry may update future estimates but must not rewrite historical routing evidence.

### NEW

- `inference-request/v1`
- `inference-lane/v1`
- `routing-policy/v1`
- deterministic `InferencePlan`
- exact-digest `InferenceGrant`
- immutable `InferenceReceipt`
- session/cache-affinity hints with lower precedence than security/capability constraints;
- sanitized coding-agent trace replay harness;
- managed client policy/config generator using secret references rather than committed secrets.

### OMIT / DEFER

- donor branding or UI;
- donor source/config copying while licensing is unresolved;
- mandatory Qwen, Ray Serve, vLLM, LiteLLM or RTX PRO 6000 dependency;
- donor benchmark parity claims;
- automatic model downloads in the first slice;
- production autoscaling before real runtime certification;
- automatic hosted fallback for private-code traffic without explicit policy authorization.

## Phase A shipping contract

Phase A is side-effect-free domain logic and deterministic tests only. It should not open a BUILDING lane until the portfolio WIP gate permits it.

### `InferenceRequest`

Required fields/semantics:

- client kind: `claude_code | codex | cursor | generic`;
- required endpoint semantic: `messages | responses | chat_completions`;
- normalized input/message/tool requirements;
- context/token estimate with provenance when available;
- project/repository/session/work references;
- privacy/residency classification;
- canonical request digest excluding raw secrets.

### `InferenceLane`

- lane id/type;
- runtime/model/adapter identity + revision;
- API semantic compatibility;
- context/tool/reasoning capability declarations;
- capability evidence + freshness;
- observed readiness/health;
- region/residency/privacy attributes;
- authorization scope;
- cost evidence with provenance;
- latency/cache observations with timestamps.

### `RoutingPolicy`

- allowed lane/provider/region sets;
- privacy/residency constraints;
- required capabilities;
- max-cost constraints;
- latency/TTFT preferences;
- fallback boundaries;
- whether hosted fallback is allowed for private-code traffic;
- cache-affinity preference;
- policy revision + canonical digest.

### `InferencePlan`

- ordered eligible candidates;
- rejected candidates with typed reasons;
- separate known/unknown cost, latency and cache evidence;
- deterministic output for exact canonical inputs;
- no execution authority.

### `InferenceGrant`

- exact request/plan/policy/lane digest binding;
- bounded expiry and one execution identity;
- cannot widen fallback/privacy/provider scope;
- cannot authorize a policy-forbidden lane;
- no raw secrets in grant or receipt.

### `InferenceReceipt`

- exact model/runtime/lane revision;
- request/session/work identity;
- terminal outcome;
- token/cache counters when available;
- TTFT, stream duration and output rate when actually observed;
- fallback transitions and reasons;
- provider/runtime-reported versus locally estimated cost clearly distinguished;
- immutable receipt digest.

## Required negative/recovery tests

- `/v1/responses` request against a chat-completions-only lane fails unless an explicit tested adapter exists;
- private-code policy forbids hosted providers: local/team failure stops instead of leaking remotely;
- stale/missing health cannot be treated as healthy;
- unsupported or unknown tool/context/reasoning capability cannot be guessed;
- strict max-cost policy + unknown cost must refuse or require an explicit policy-defined override;
- same canonical inputs produce the same plan digest;
- model, policy, capability or health changes change the digest where relevant;
- plan alone cannot execute;
- grant cannot be replayed for another request/lane;
- expired or mismatched grant fails closed;
- fallback cannot cross a provider/residency boundary absent from the original authorization;
- cache affinity cannot override privacy or capability constraints;
- successful route does not imply quality parity;
- receipt never labels locally estimated tokens/cost as provider-reported;
- restart during streaming records `interrupted/unknown`, never fabricated success;
- partial stream followed by transport loss is not full success;
- raw repository/source/session traces are never persisted or uploaded by benchmark tooling without explicit sanitization policy.

## Later implementation phases

### B — endpoint compatibility adapters

Add explicit/tested OpenAI Responses, OpenAI Chat Completions and Anthropic Messages adapters. Fake/local servers first.

### C — local/team runtime binding

Bind to #81 capability evidence and explicitly configured compatible inference servers. Do not build a model installer first.

### D — governed routing/fallback

Cost/privacy/latency/capability/cache-aware ranking, bounded retries, health circuits and no-leak fallback semantics.

### E — telemetry + trace replay

Reuse #66 session telemetry, sanitize/import real coding-agent traces, replay comparable workloads and compare TTFT/goodput/cache/cost/quality evidence.

### F — real runtime certification

Certify one developer-owned runtime plus one shared/team GPU runtime with exact model/runtime revisions and real client connectivity for Codex, Claude Code and Cursor where available.

### G — team rollout

Managed policy/config generation with secret references, versioning, rollback and operator visibility.

## Verification ladder

No completion or parity claim before this evidence exists:

`contract tests -> repository CI -> fake endpoint integration -> real local runtime -> real team runtime -> trace replay -> failure/restart tests -> client UAT -> exact-SHA receipts -> tracker advancement`

## Tracker / WIP truth

Tracker ID remains pending reconciliation; do not guess an `RE-*` number.

The portfolio currently has multiple BUILDING lanes. This donor is intentionally advanced to **Shipping Contract Ready** without opening uncontrolled implementation work. Feature implementation begins only when the canonical WIP gate permits it.

## Explicit non-claims

No Anyscale parity. No donor source reuse. No Qwen/Claude quality-equivalence claim. No reproduced 90% savings claim. No reproduced benchmark claim. No GPU runtime implemented yet. No real client certification yet. No production deployment. No tracker ID assigned yet.
