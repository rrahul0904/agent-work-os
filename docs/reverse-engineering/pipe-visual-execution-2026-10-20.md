# REA evidence intake: Pipe IDE → governed Visual Execution Graph

**Intake date:** 2026-10-20  
**Governance:** [Agent Work OS #345](https://github.com/rrahul0904/agent-work-os/issues/345) and REA #88  
**Decision:** DONOR / REFERENCE, no separate clone; canonical execution remains in Agent Work OS.  
**Status:** source resolved; public first-party materials reviewed; native browser IDE not interactively tested; independent read-model slice in draft.

## 1. Identity, evidence, and coverage

| Source | What it can support | Limitations |
| --- | --- | --- |
| [r/SideProject post 1xb4uk4](https://www.reddit.com/r/SideProject/comments/1xb4uk4/webbased_pipe_ide_is_released_no_signup_required/) | Creator's IDE announcement, no account, local browser storage claim, limited first release, Python extension, tutorial links | Self-report; no independent security or functional test |
| [Pipe IDE v1](https://www.pipelang.com/pipe/v1/) | Client-rendered, public entrypoint | The static reader yielded no usable rendered UI; no browser instrumentation was performed |
| [Pipe home](https://www.pipelang.com/) | Product positioning, historical claim of seven years of research, 11 patents pending, language plus runtime vision | Marketing assertions are not implementation proof |
| [Six Pillars](https://www.pipelang.com/six-pillars.html) | Creator-published description of explicit state, sequential signals, mergers, typed domains, Python/text extensions, direct runtime | Architecture claims, not independently verified in current IDE |
| [Book PDF](https://www.pipelang.com/downloads/book.pdf) | Author's language specification and legal notice | Copyright 2026; free for research/review/education; commercial use requires author permission |
| [Data Swap tutorial](https://www.pipelang.com/assets/tutorials/v1/tutorial1.mp4), [Reusable Sum tutorial](https://www.pipelang.com/assets/tutorials/v1/tutorial2.mp4) | Public demo artifacts for later user-visible black-box tests | Videos linked, not frame-by-frame independently evaluated here |

### Verified source identity vs name collisions

TopLineSoft Systems / Oleg P. Kabanov is the source identity indicated by the site, PDF and public announcements. Public repositories with similarly named `pipelang` projects (for example `renatopp/pipelang`) are different languages: *do not* treat them as source for TopLineSoft's Pipe. No official public source tree, source revision, or redistributable code license for the application was verified.

**Legal gate:** First-party site announces patent applications; the book itself expressly restricts commercial use. A public website or readable PDF does not authorize copying source, visual semantics, diagrams, implementations, graphics or branding. The generic ideas of a graph visualization, immutable event receipts, authorization checks, deterministic serialization and tracing are independently implementable engineering patterns; do not imitate Pipe-specific notation, operational rules or patent-sensitive mechanisms. Patent/FTO assessment remains **unreviewed**, not cleared.

## 2. Behavioral reconstruction matrix

| Capability | Public reference claim | Owned decision | Maturity |
| --- | --- | --- | --- |
| Node canvas / dependencies | Editable visual programs | Read-only graph derived from canonical execution records | Initial contract authored |
| State and memory | Explicit visual memory nodes | Reference work state, never create independent state authority | Design |
| Scheduling and signals | Sequential processing, synchronization and mergers | Keep existing Agent Work OS event/process controls; no clone of signal semantics | Reference only |
| Types and data compatibility | Tree-structured static domains | Original schema-bound node/edge contract first | Initial contract authored |
| Python extension | Python text code inside visual programs | Do not evaluate Python or arbitrary code from the canvas | Intentionally omitted |
| Runtime hot patch | Live visual execution/patching promoted as long-term capability | Governed edit proposal → isolated replay → approval → deployment gate | Future; explicitly *not* enabled |
| Input/output tapping | Every block observable in claimed future runtime | Reuse existing run/receipt telemetry and redact sensitive output | Future |
| Browser local storage | Announcement says browser database | Avoid claim of encryption, sync or recoverability without tests | Unverified |
| Backend sharing | Future milestone | No server deployment added by this intake | Out of scope |
| Undo/export/import | Not established in reviewed public evidence | Must be black-box tested if needed | Unknown |
| Accessibility/mobile | Not established in reviewed public evidence | Research separately before promising parity | Unknown |

**Key distinction:** Pipe's announced semantics are not the design or implementation of our graph contract. Our read-model is a conventional DAG presentation of work *already* modeled and controlled elsewhere, not a competing visual programming language.

## 3. Owned visual execution read-model v1

Source: `packages/domain/src/visual-execution-graph.js`, with tests in `packages/domain/test/visual-execution-graph.test.js`.

Inputs are *already authorized and canonicalized* before calling this pure function; the function performs additional structural validation only. Strict fields and tenant/run scoping prevent accidental connections across independently queried run records. Terminal states require a syntactically valid canonical receipt reference. The presenter must still verify the receipt exists, belongs to the same scope, was independently certified and is allowed to be displayed.

The read model contains:

- `schema: awos.visual-execution-read-model/v1`
- `scope: { organizationId, runId }`
- `nodes: [{ id, type, status, organizationId, runId, workItemId?, receiptId? }]`
- `edges: [{ id, from, to, type }]`
- `digest` SHA-256 of canonical sorted schema/scope/node/edge projection; digest proves only same payload, **not** authenticity.

Current accepted node types: `task`, `agent`, `verification`, `gate`. Current edge types: `depends_on`, `handoff`, `verifies`. Current statuses: `pending`, `running`, `blocked`, `complete`, `failed`. Graph must be a connected directed acyclic graph, between 1 and 500 nodes and at most 1000 edges. Any unsupported graph requires a future contract and a new test suite; do not silently represent a cycle or disconnected workflow.

### Example (shape only)

```json
{
  "scope": { "organizationId": "org_<canonical-uuid>", "runId": "run_<canonical-uuid>" },
  "nodes": [
    { "id": "task-a", "type": "task", "status": "running",
      "organizationId": "org_<canonical-uuid>", "runId": "run_<canonical-uuid>" }
  ],
  "edges": []
}
```

Placeholders are not executable IDs. Actual callers must use typed canonical UUIDs.

### Threat boundaries

1. **Graph never executes:** no eval, tool dispatch, model invocation, remote fetch, Python runtime, process spawn, approval write or runtime patch.
2. **Browser authorization:** caller filters by tenant/project/run under the existing control plane. Graph shape validation is *not* an authentication/authorization substitute.
3. **Receipt provenance:** read model may display a terminal status only after the upstream receipt verifier authorizes and authenticates the reference. Checking receipt syntax alone is insufficient.
4. **Privacy:** never pass full transcript prompts, token values, secrets, raw browser captures or unredacted evidence into node metadata; v1 deliberately does not allow arbitrary metadata.
5. **Determinism:** stable sorted canonical payload and digest, immutable returned graph. Treat a digest as equality evidence, not a signature.
6. **Change gates:** editor and hot-patch capability must not write to a live executor. A future change travels through explicit approval, shadow evaluation, failure recovery and Shipping OS gates.

## 4. Acceptance gates and implementation roadmap

| Phase | Outcome | Gate |
| --- | --- | --- |
| 0 — source intake | First-party URLs, legal notices, claims/unknowns, comparisons and issue | **Done** |
| 1 — read-model contract | Deterministic canonical DAG with tenant scopes, evidence links, rejection tests | **Code in research branch; CI review pending** |
| 2 — evidence bridge | Link authorized canonical events, work-item versions, receipt proofs, immutable snapshots | Not started |
| 3 — visual workbench | React/canvas with keyboard accessibility, history and read-only tracing | Not started |
| 4 — replay/diff | deterministic replay view, redacted node IO, before/after and exact SHA receipts | Not started |
| 5 — guarded authoring | compile proposals into typed work items; approval-gated side-effect dispatch | Not started |
| 6 — security/product | adversarial tests, persistence/export, browser/desktop/mobile parity, deployment receipts | Not started |

### Test coverage in the initial slice

Eight authored `node:test` cases: stable serialization/freeze, duplicate nodes/edges, mixed scope, missing/malformed receipt references, extraneous script/prototype rejection, dangling/cyclic/disconnected/self-loop rejection, graph size bounds, no input mutation/no execution API. Root `npm test` is updated to include domain tests. Passing tests/CI must be read from the *actual* run results, not inferred from test authorship.

### Explicitly unfinished

- No live-browser end-to-end walkthrough of the client's initial release.
- No license to reproduce the proprietary Pipe implementation.
- No upstream application SHA/source inspection (none verified).
- No matching/general-purpose Pipe-language interpreter.
- No UI canvas, autonomous graph execution, networked sync, backend or production deployment.
- No checked ownership of actual receipt IDs beyond their type format.
- No security audit or patent/legal opinion.

## 5. Integration ownership and anti-duplication

- **Agent Work OS:** task/event/approval/execution truth and read model; existing shipping/replay gates.
- **REA #88:** target/source evidence, claim/observation separation and provenance.
- **Agent Workbench #99:** primary UI workspace and human-in-the-loop command experience.
- **Visual Intelligence #206, Archify #341:** renderer / DiagramSpec outputs; no new canonical executor.
- **Sary-OS #217:** related live canvas and state preservation ideas; avoid overlapping runtime authority.
- **DevScribe #327:** editable engineering artifacts, not the source of Agent OS execution state.

**Promotion rule:** Only promote this research branch after node:test and appropriate integration tests pass, receipt verification integration exists or remaining limits are explicit, provenance is audited, and a human approves PR review. No direct merge/push/deploy beyond this isolated research branch.
