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
- **HISTORICAL** — a real prior defect/request that later release evidence says was addressed.
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

## 4. Feedback, current gaps, and historical defects

### Reddit feedback

- Concern that sponsors could bias the curriculum.
- Request for a security sweep / data-collection review.
- Sparse comments relative to post engagement; do not infer more sentiment than is visible.

### CURRENT / still-open source feedback verified during intake

1. **Learning-contract ambiguity** — issue #431 remains open: a beginner asks what they are supposed to do during Build/Use/Ship and where to execute/submit the work.
2. **Hardware portability** — issue #294 remains open and documents CUDA-only paths that ignore Apple Silicon MPS in multiple lessons.
3. **Navigation/mastery ideas** — dependency-path navigation, highlighting/cheat-sheet and completion/shareability requests remain useful donor ideas unless exact-head source verification proves they are fully implemented.
4. **Environment drift risk** — the curriculum is large enough that commands, datasets and dependencies can drift; current releases added broader CI but do not eliminate the need for reproducibility contracts in RE-330.

### HISTORICAL feedback that the current source has already addressed

Do **not** treat these as unresolved competitor weaknesses:

- quiz answer-position bias — release notes report redistribution plus a CI guard;
- answer leakage in tutor reply-format examples — release notes report answer-key separation and leakage fixes;
- lack of animated figures — current releases report animated figures across the curriculum plus mobile handling;
- weak runtime/reference verification — recent release notes report CI execution of lesson tests where feasible and a sweep repairing stale datasets, models, tools and links.

These historical failures are still valuable as regression tests for RE-330 because they show how a learning product can silently lose assessment integrity or runtime reproducibility over time.

## 5. Sponsor/security finding

Initial source-code search found SerpApi in sponsor/README/backer material. No evidence was found in this intake that core learning execution depends on SerpApi. That is **not** equivalent to a complete security audit. RE-330 should improve on this by making every external dependency explicit in a machine-readable lesson manifest and denying undeclared network access in the lab runner.

The source privacy page says lesson access does not require an account, payment, API keys or private project files; optional local progress/quiz/theme state is browser-local, while ordinary hosting/analytics request data may be received by providers. Treat this as a first-party privacy statement, not independently verified telemetry proof.

## 6. Donor capability map

### MATCH

- curriculum catalog and tracks
- runnable exercises/labs
- local progress
- evidence-based completion
- agent tutor entry point

### IMPROVE

- placement assessment → deterministic personalized route
- make the **Concept → Build → Use → Ship** contract operationally explicit: where to run, what success looks like, what file/result to keep
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
- provenance on generated learning content so a learner can distinguish authored content, generated hints, and execution evidence

### OMIT

- source branding, prose, lesson text, diagrams and exact UI.
- sponsor placement in the core learning transaction.
- unsupported completion/certification claims.
- silent network calls or undeclared provider dependencies.

## 7. Clean-room Phase A vertical slice

Build one end-to-end route in RE-330 using entirely original content:

1. **Placement** — 10-question assessment produces one deterministic route.
2. **Route** — three original lessons in one track.
3. **Lesson contract** — Concept → Build → Use → Ship for each lesson, with explicit execution location, success criteria and expected artifact.
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
- semantic distractor quality check
- blocked undeclared-network test
- declared-network allowlist test
- CUDA/MPS/CPU preflight branches
- broken-command failure receipt
- dependency/version mismatch failure path
- evidence receipt idempotency/replay
- artifact hash mismatch rejection
- tutor cannot self-award completion without evidence
- mobile and desktop rendering for route, lesson, quiz and prerequisite graph
- reduced-motion behavior for any animated visualization

## 10. Verification ladder

`RESEARCHED → SPECIFIED → PLANNED → IMPLEMENTING → LOCALLY VERIFIED → REVIEWED → PR READY → MERGED → DEPLOYMENT VERIFIED`

Do not collapse these states. Exact branch/SHA, tests, browser evidence and hosted runtime evidence are separate receipts.

## 11. Repository reconciliation findings

The reconciled tracker records RE-330 as a functional local beta but does not yet identify a verified canonical GitHub implementation repository.

Connected GitHub candidates checked during this intake:

- `academyos-ai` — **not RE-330**; it is a provider-neutral cloud certification/practice platform with exam, blitz and architecture-builder mechanics.
- `all-course-react-app` — **not enough lineage evidence**; root README is the default Create React App README and the repository also contains a separate PracticAI rebuild subtree.
- `edugpt` — **not RE-330**; it is an older LangChain/CAMEL-inspired AI instructor that dynamically creates a syllabus.

Therefore this branch contains **research/specification only**. Product code must not be added to Agent Work OS or a look-alike education repository merely because the domain overlaps.

## 12. Immediate next work

- continue repository reconciliation against the RE-330 local-beta lineage using concrete file/content fingerprints;
- register the canonical implementation location in the tracker when proven;
- open an implementation issue in that repo with the Phase A acceptance contract above;
- push the first vertical slice on an isolated branch;
- attach focused test evidence before any preview/deployment claim.
