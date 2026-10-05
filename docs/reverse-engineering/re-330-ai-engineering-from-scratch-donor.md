# RE-330 Donor Study — AI Engineering from Scratch

Status: RESEARCHED → SPECIFIED
Parent product: **RE-330 ML Canvas Academy**
Source thread: https://www.reddit.com/r/BestGitHubRepos/comments/1wwjgl9/ai_engineering_from_scratch_523_lessons_covering/
Canonical source: https://github.com/rohitg00/ai-engineering-from-scratch
Observed source head: `5b5ab48cd63d7ae5b4002985d9ac9de4ed86c2c0` (2026-10-05)
Coordination issue: #33

## 1. Why this is a donor, not a new product

RE-330 already owns the AI/ML education surface: Python, SQL, ML, deep learning, LLMs, RAG, LangChain, agentic AI, automation, interactive drills/labs, visual learning, and progress. This source is therefore a capability donor/comparator. The goal is to improve RE-330 rather than create another education product.

## 2. Evidence model

Use these labels throughout this study:

- **OBSERVED** — behavior directly visible in the source/site/repository.
- **DOCUMENTED** — claimed by first-party documentation but not independently executed here.
- **CORROBORATED** — supported by multiple independent public sources or issue reports.
- **INFERRED** — architecture/product conclusion derived from evidence.
- **UNKNOWN** — not yet evidenced.
- **CONFLICTED** — evidence disagrees.

No parity claim should be upgraded beyond the strongest evidence available.

## 3. Source/product decomposition

### OBSERVED product surfaces

- Public static website and GitHub-native curriculum.
- 20 phases / 523 lessons / four implementation languages.
- Learning-path router and catalog.
- Local browser progress and quiz state.
- Glossary, roadmap, books/releases, certification-prep routes and project/capstone navigation.
- Installable agent tutor skills (`start-learning`, `learn`, `course-guide`, `check-understanding`, `learn-mcp`, `learn-agent-skills`, certification tutors, `build-project`).
- Lesson contract centered on problem/concept → first-principles build → production/framework usage → shipped artifact.
- Learner evidence guidance: command, working directory, exit code, meaningful output and changed/generated artifact.

### DOCUMENTED architecture shape

- Static site with generated data/content pages and browser-local learner state.
- Lesson source lives alongside runnable code and reusable outputs.
- Focused paths share the same underlying lesson corpus.
- Agent skills read from the repository and maintain learner plans/state in local markdown files.
- Hosted site may receive ordinary request/analytics-provider data; local progress is not required to read the curriculum.

## 4. Public feedback and source-side defects

### Reddit feedback

- Concern that sponsors could bias the curriculum.
- Request for a security sweep / data-collection review.
- Sparse comments relative to post engagement; do not infer more sentiment than is visible.

### GitHub issue themes

1. **Learning-contract ambiguity** — learners ask what they should actually do during Build/Use/Ship.
2. **Visual explanation demand** — requests for reusable diagrams/animations and richer technical visualizations.
3. **Navigation/mastery** — interactive prerequisite graph, global search, highlights and cheat sheets.
4. **Completion/shareability** — certificate request.
5. **Assessment integrity** — predictable answer position, weak distractors, and answer leakage in tutor prompts.
6. **Environment drift** — invalid commands/dataset identifiers and tool/version drift.
7. **Hardware portability** — CUDA-only paths that ignore Apple Silicon MPS.

These are valuable negative requirements for RE-330.

## 5. Sponsor/security finding

Initial source-code search found SerpApi in sponsor/README/backer material. No evidence was found in this intake that core learning execution depends on SerpApi. That is **not** equivalent to a complete security audit. RE-330 should improve on this by making every external dependency explicit in a machine-readable lesson manifest and denying undeclared network access in the lab runner.

## 6. Donor capability map

### MATCH

- curriculum catalog and tracks
- runnable exercises/labs
- local progress
- evidence-based completion
- agent tutor entry point

### IMPROVE

- placement assessment → deterministic personalized route
- one coherent lesson contract: **Concept → Build → Use → Ship**
- portfolio artifact on every lesson
- evidence receipt on every successful run
- agent tutor that resumes from persisted learner state
- dependency/prerequisite graph
- project/capstone builder
- focused MCP / Agent Skills / LLM / RAG paths sharing the same content graph

### NEW / DIFFERENTIATE

- combine RE-330 drills with lessons/labs into one mastery graph
- Python + SQL + ML/AI + LLM + RAG + LangChain + agentic AI + automation in one platform
- narrated visual lessons with captions and reduced-motion equivalents
- quiz integrity engine with randomized answer positions, semantic distractor checks and leakage tests
- hardware-aware lab preflight (CUDA → MPS → CPU)
- dependency-lock and reproducibility metadata per lab
- declared-network manifest and blocked-network negative tests
- deterministic replay receipts and artifact hashes
- skill-generated remediation route after failed drills/labs

### OMIT

- source branding, prose, lesson text, diagrams and exact UI.
- sponsor placement in the core learning transaction.
- unsupported completion/certification claims.
- silent network calls or undeclared provider dependencies.

## 7. Clean-room Phase A vertical slice

Build one end-to-end route in RE-330 using entirely original content:

1. **Placement** — 10-question assessment produces one deterministic route.
2. **Route** — three original lessons in one track.
3. **Lesson contract** — Concept → Build → Use → Ship for each lesson.
4. **Lab preflight** — runtime/tooling + CUDA/MPS/CPU detection before execution.
5. **Evidence receipt** — command, cwd, exit code, selected output, artifact hash and timestamp.
6. **Practice** — one drill + one quiz per lesson.
7. **Assessment integrity** — randomized answer position, answer-key isolation and leakage regression test.
8. **Prerequisite graph** — current lesson, prerequisites and next unlock rendered from typed metadata.
9. **Tutor contract** — source-grounded tutor resumes from learner state; it may explain but cannot mark execution complete without receipt evidence.
10. **Network boundary** — labs are offline by default; external calls require an explicit allowlisted manifest entry.

## 8. Proposed data contracts

```text
LearningTrack
  id, title, description, prerequisites[], outcomes[]

Lesson
  id, track_id, title, objectives[], prerequisites[], beats[], lab_id, drill_id, quiz_id, ship_artifact_type

LabManifest
  id, runtime, required_tools[], optional_accelerators[], network_policy, allowlisted_hosts[], command, timeout_seconds

LearnerState
  learner_id/local_id, placement_result, active_route[], lesson_status{}, mastery{}, updated_at

EvidenceReceipt
  receipt_id, lesson_id, lab_id, command, cwd, exit_code, output_digest, artifact_path, artifact_sha256, runtime_fingerprint, created_at

Quiz
  id, questions[], answer_key_ref, shuffle_seed_policy

MasteryReceipt
  lesson_id, drill_score, quiz_score, lab_receipt_id, ship_artifact_receipt_id, status
```

## 9. Required tests before Phase A can be called locally verified

- placement determinism for identical answers
- route prerequisite validity
- quiz answer-position distribution
- answer-key leakage negative tests
- blocked undeclared-network test
- declared-network allowlist test
- CUDA/MPS/CPU preflight branches
- broken-command failure receipt
- evidence receipt idempotency/replay
- artifact hash mismatch rejection
- tutor cannot self-award completion without evidence
- mobile and desktop rendering for route, lesson, quiz and prerequisite graph
- reduced-motion behavior for any animated visualization

## 10. Verification ladder

`RESEARCHED → SPECIFIED → PLANNED → IMPLEMENTING → LOCALLY VERIFIED → REVIEWED → PR READY → MERGED → DEPLOYMENT VERIFIED`

Do not collapse these states. Exact branch/SHA, tests, browser evidence and hosted runtime evidence are separate receipts.

## 11. Current repository reconciliation gap

The reconciled tracker records RE-330 as a functional local beta but does not yet identify a verified canonical GitHub implementation repository. This branch contains **research/specification only**. Product code must not be added to Agent Work OS. The next engineering action is to reconcile or establish the canonical RE-330 repository and then implement the Phase A slice there.

## 12. Immediate next work

- reconcile existing user repositories against the RE-330 local-beta lineage;
- register the canonical implementation location in the tracker;
- open an implementation issue in that repo with the Phase A acceptance contract above;
- push the first vertical slice on an isolated branch;
- attach focused test evidence before any preview/deployment claim.
