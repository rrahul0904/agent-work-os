# DevTrace AI -> Engineering Context Lens (REA clean-room intake)

Intake 2026-10-20 ET | Issue #309 | Classification: DONOR / MODULE, NOT a standalone product.

## Source and evidence
- User-supplied shortlink: https://www.reddit.com/r/SideProject/s/z5cS61iF1R
- Canonical Reddit: https://www.reddit.com/r/SideProject/comments/1xai4i6/i_built_devtrace_ai_to_help_developers_understand/ by u/Addygaur.
- Product: https://devtrace-ai.vercel.app/ — public homepage says engineering memory, ADRs, incidents, code-question answering via memory plus context, and downstream impact analysis. CockroachDB is named there.
- Public Reddit author claims an MVP with file-linked memory and change-impact notes. These are *author claims*, not production validation.
- Only public homepage was retrievable; other SPA routes and authenticated behavior were unavailable in this runtime. No source repository or reusable license verified for this particular product.
- Unrelated github.com/JexanJoel/devtrace-ai is a different product. No donor source code, branding, assets, internal APIs or templates used.
- REA runtime replay/execution NOT performed here. Public-source reconstruction only. No RE-* ID assigned until canonical tracker reconciliation.

## Internal deduplication
- Agent Work OS issue #166 is the canonical durable Memory Plane, not another database to replicate.
- Issue #115 owns verified context pack projections; #9 and #21 own cross-session/cross-agent memory.
- Context Continuity is an eventual consumer. REA #88 remains an evidence provider.
- New capability gap: source-backed *file-linked* engineering decisions and bounded advisory change-impact hints.

## MATCH / IMPROVE / NEW / OMIT
MATCH: durable engineering notes, codebase context, project/file references, impact questions.
IMPROVE: retrieval authorization, repo isolation, provenance digests, explicit memory status and supersession, bounded context and safe fallbacks.
NEW: engineering-context/v1 pure read-model and engineering-impact/v1 advisory direct/declared file match.
OMIT: proprietary app reverse-engineering, speculative dependency graphs, uploading private repo files, auto-promoting AI text to truth, another memory store, new brand or standalone repo.

## Slice A implementation
Source: packages/memory-plane/src/engineering-context.js
Tests: packages/memory-plane/test/engineering-context.test.js

Input to createEngineeringContextLens: {records, projectId, repositoryId, canRead}
- The authoritative Memory Plane is responsible for authentication, approval, persist/rollback, true source hash verification and identity.
- The read model accepts ONLY current approved/verified records in one exact repository/project, with explicit canRead(record) === true.
- It validates explicit source {type,id,sha256}, titled kind, immutable projection and safe relative file paths.
- recall(query) uses deterministic lexical scores and returns provenance for citations; NO embeddings or LLM.
- assessChange(changedFiles) matches *exact paths* against direct file links and author-declared impact paths, marked advisory. It is NOT an independently verified dependency graph, code analysis or evidence of runtime breakage.
- No filesystem access, repository crawling, network writes, database writes, live authentication endpoint or deployment.
- Input record trust/digest metadata are upstream assertions, not cryptographically verified by this lens.

## Threat model / proof
- No cross-repository/tenant memory recall: scope before indexing and callback filter, including async/undefined grants denied.
- Unsafe path aliases, traversal and control characters denied.
- Superseded, retracted and untrusted memory excluded.
- Duplicate IDs rejected. Results stable across input ordering; bounded to prevent flooding.
- Provenance retained; source memory text is inert data, never instructions.
- Negative tests cover authorization, scope, path safety, status, provenance, advisory impact and input immutability.

## Remaining phases / gates
| Phase | Feature | Acceptance | Status |
| --- | --- | --- | --- |
| A | Pure engineering context projection | Node unit tests + root CI | Branch implemented; CI pending |
| B | Source-backed durable propose/approve/commit | restart / retraction / migration / ACL | NOT DONE (#166) |
| C | Local git file/line/rename mapper | SHA pin, stale markers, symlink avoidance, no upload | NOT DONE |
| D | Authenticated read/write API + UI | project tenancy, reviewer approval and user journeys | NOT DONE |
| E | Proven dependency graph impact | graph provenance, false-positive tests, replay | NOT DONE |
| F | Context pack, evaluation and release | independent exact-SHA CI, UAT, Shipping OS receipt | NOT DONE |

Verify slice A locally: node --test packages/memory-plane/test/engineering-context.test.js
CI must run the same test on the exact PR head. PR stays draft until verified. No merge/deployment without gate.
