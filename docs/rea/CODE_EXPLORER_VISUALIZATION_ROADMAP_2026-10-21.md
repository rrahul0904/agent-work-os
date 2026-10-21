# REA / Code Explorer — source-grounded visual explanations

**Recorded:** 2026-10-21  
**Status:** Donor reviewed; implementation not started or shipped  
**Canonical repo:** `rrahul0904/agent-work-os`  
**Tracking:** [REA #352](https://github.com/rrahul0904/agent-work-os/issues/352), [Visual Intelligence #206](https://github.com/rrahul0904/agent-work-os/issues/206)  
**Disposition:** Shared DONOR/CAPABILITY for the Agent Work OS evidence plane, PR Lens and Technical Visual Studio—not a separate product.

## User outcome

The owner should be able to choose **one of our actual repositories or worktrees** and see:

- **System map:** major modules and verified calls/imports, with click-to-expand and `path:line` source locations.
- **Flow player:** what happens when a real user or coding agent performs an action; timeline, arrow, step explanation and relevant state.
- **Code slow motion:** exact verified code with line cursor, function stack and illustrative value changes; glossary and prediction prompts.
- **Change explorer:** commit-to-commit or PR diff impact, changed module map and before/after explanation.
- **Verification status:** distinguish inferred static explanation, illustrative replay and independently captured live execution; every artifact has a pinned commit and evidence manifest.

For example, “How does Agent Work OS start a Codex session?” should show operator UI → control API → daemon → Codex adapter → normalized events → UI update, using paths and functions from the selected exact revision. **The diagram is a hypothesis until every step has been source-verified.** Future execution claims require actual trace receipts.

## Donor record and boundary

- Original Reddit: https://www.reddit.com/r/vibecoding/s/U4aoHiOc8b
- Resolved: https://www.reddit.com/r/vibecoding/comments/1xbramx/i_created_a_skill_that_lets_you_understand/
- Upstream source: https://github.com/precious112/code-slowmo
- Reviewed upstream README, `skills/code-slowmo/SKILL.md`, `skills/code-slowmo/references/page-format.md`, and root MIT LICENSE on 2026-10-21.
- Upstream documented mechanics: `SKILL.md` directs agent to read real code, anchor `file:line`, create JSON data, validate with `scripts/build.py` / `check_text.py`, output local single-file HTML. Sections can include map, flow, trace, compare, glossary and custom. Examples feature Puck drag/drop and undo. Python >=3.8 required to run donor build.
- **Observed:** public source and documented behavior. **Not verified in our environment:** upstream generator runtime, host/security model when invoked through a coding agent, accuracy on our repos, upstream performance claims, any live tracing capability.
- License: MIT, © 2026 precious112. Before copying upstream code, pin source revision, inspect scripts/template/third-party assets, preserve copyright and license in redistributions. Clean-room reimplementation is default; behavior comparison and MIT-licensed study permitted under the policy and attribution requirements.
- Do not copy upstream branding, marketing assets, or example outputs into our production interface. Do not install or execute remote `npx` packages without approval and sandbox review.

## Avoid duplicate projects

Agent Work OS is the orchestration, repository access, source-grounding and evidence owner. It can produce one versioned `CodeExplainerSpec`, with consumers:

1. Agent Work OS operator UI — read-only “Understand this code” feature.
2. Visual Intelligence / Technical Visual Studio — DiagramSpec renderers, maps, flow and sequence views.
3. PR Lens — changed-symbol edges and diff overlays.
4. Locally portable standalone `index.html` plus accompanying `spec.json` and evidence ledger.

Related work: [Visual Intelligence #206](https://github.com/rrahul0904/agent-work-os/issues/206), [Agent Workbench #99](https://github.com/rrahul0904/agent-work-os/issues/99), [Read-only visual execution graph #345](https://github.com/rrahul0904/agent-work-os/issues/345). “Agent Room” is runtime-agent observability, not source-code execution visualization. Share components without merging semantics.

## Core contract (target)

`CodeExplainerSpec v1`:

```text
subject          { repo, commitSha, worktreeId?, sourceRoot, capturedAt }
question         user question, audience, optional selected feature/function
nodes[]          stable ID, kind, label, sourceSpan, evidenceMode
edges[]          source/target ID, type, verifiedSourceSpans[]
sections[]       architecture-map | flow | code-trace | diff
steps[]          ordered action, plain summary, exact source spans,
                 observed/illustrative state, values/logs/stack?
glossary[]       term, plain-English explanation, source reference?
provenance       generator name/version, inputs manifest, checks,
                 exact hash of source/snippets, artifact hashes
review           verified | disputed | unverified per claim
```

Evidence modes are mutually explicit:
- **static-source:** source-backed explanation, calls/imports/branches as inspected.
- **illustrative:** trace with sample values/simulated state/UI; **never label as observed**.
- **observed-runtime:** actual instrumented event with run ID, input fixture and runtime receipt.
- **unverified:** assumption, possible impact, or missing symbol/path; visually segregated.

Each `sourceSpan` points to a pinned `commitSha:path:startLine:endLine`. If the source changed, either regenerate/revalidate or show **STALE**; do not silently move a link to HEAD.

## Security and correctness

- Source reads remain local through approved repo/worktree; whitelist repository root, reject symlinks/path escape and unbounded traversal. No generalized web fetch, shell execution or remote code submission.
- Scope private code to authorized project and organization; avoid shipping raw source bodies to the hosted control plane by default. Redact tokens/PII, guard against prompt injection embedded in source comments, enforce max bytes/files/graph size.
- Escape arbitrary code/documentation strings in HTML/JS; do not permit untrusted custom HTML/script in the exported explainer.
- Static call graphs must not invent dynamic calls, runtime database states or coverage. A built HTML explanation does not validate correctness of the underlying code.
- Access changes and repos in read-only mode. The viewer never acquires approval, deploy, merge, write or agent-execute privileges.

## Work phases and gates

### P0 — validate external idea on our actual repository

- [ ] Record **upstream exact commit SHA** and hash reviewed files; license/security check.
- [ ] Select pinned Agent Work OS commit and answer two questions: “What are the main components?” and “What happens when an operator starts a session?”
- [ ] Create `spec.json`, `index.html`, explanation + source receipts. Include both architecture and timeline.
- [ ] Verify each key claim manually against the selected revision, sample at least 10 sourceSpan links.
- [ ] Test offline browser (desktop + touch), keyboard, reduced motion, static loading, labels and text clarity.
- [ ] Record what is unknown; no `working` claim until the above actually executes.

### P1 — owned reusable implementation

- [ ] Versioned contract + JSON Schema; pure validators and intentionally malicious fixtures.
- [ ] Read-only local source adapter with bounded indexing and source-span verification.
- [ ] Human-readable narrative generator and deterministic explanations; fail-closed evidence validator.
- [ ] Browser UI: map, flow, trace, source click-through, evidence mode/stale indicator; optional locally exported offline HTML.
- [ ] Integrate one narrow path to PR Lens / DiagramSpec, no separate duplicate rendering stack.
- [ ] End-to-end run from pinned repo → independent source verification → interactive output → receipt bundle.

### P2 — compare and review

- [ ] Source-aware diff mapping: head/base SHA, confirmed changes vs inferred impact.
- [ ] Optional trace adapter that captures actual run after explicit sandbox permission; signed, redacted trace receipts.
- [ ] Incremental caching/budget handling for large repos, deep-project zoom and supported-language matrix.
- [ ] Workspace-scope ACLs, safe sharing/export, visual regression, broad language fixtures.

## Release gate

**No feature or deploy claim** until there is a commit with tests, exact-head CI, browser UAT, source accuracy review and security review. Candidate reports must identify `PLANNED`, `REVIEWED`, `TESTED`, `PREVIEWED`, and `PRODUCTION` as distinct states. Do not auto-merge, deploy or perform provider writes. 

**This document is only a researched roadmap / implementation contract.**
