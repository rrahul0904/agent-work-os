# BeaconFind → Local Knowledge Search Engine Research Dossier

**Snapshot:** 2026-10-14  
**Coordination issue:** #174  
**Source:** https://www.reddit.com/r/IMadeThis/s/D2IQpyZrEo  
**Product:** https://beaconfind.app/  
**Observed public version:** v1.3.169 (2026-10-09 changelog entry)  
**Implementation status:** not started  
**REA artifact/runtime status:** not executed in this chat/runtime

## Executive decision

BeaconFind should be treated as both:

1. a **capability donor** for a provider-neutral Local Knowledge/Search Engine that can be used by Agent Work OS under explicit local-root grants; and
2. a **standalone desktop product opportunity** for private, local-first semantic search.

Do not build a cosmetic BeaconFind clone. Preserve the useful product mechanics and independently design the implementation, UX, contracts, packaging and commercial model.

The strongest differentiated commercial thesis is:

> private local knowledge search + explainable retrieval + governable agent grounding + provable no-egress behavior.

## Canonical roadmap status

`SOURCE -> EVIDENCE -> REA INVESTIGATION -> UNDERSTANDING -> RECONSTRUCTION -> SPECIFICATION -> IMPROVEMENT -> BUILD -> VERIFY -> COMPARE -> DEPLOY -> CERTIFY`

Current truthful state:

- SOURCE: done
- PUBLIC EVIDENCE: done first pass
- WORKFLOW RECONSTRUCTION: done first pass
- ARCHITECTURE RECONSTRUCTION: done first pass
- REDDIT FEEDBACK: done first pass
- COMPETITOR/DONOR SCAN: started
- CLEAN-ROOM SPECIFICATION: initial
- REA RUNTIME/ARTIFACT INVESTIGATION: not run
- OWNED IMPLEMENTATION: none
- VERIFICATION/REPLAY: none
- DEPLOYMENT/CERTIFICATION: none

REA remains a governed evidence provider, not the project authority. Agent Work OS owns policy, provenance, implementation, verification, replay and Shipping OS gates.

## What the target publicly demonstrates

Observed public user loop:

`select folders -> extract/OCR -> chunk -> embed text/images -> encrypted local index -> global hotkey -> hybrid search -> ranked results/preview -> optional local answer with citations`

Documented public capabilities include:

- Windows 10/11 and Apple Silicon macOS;
- Rust + Tauri;
- global search overlay (`Ctrl+K` / `Option+Space`);
- semantic, keyword/BM25, filename and image search;
- multilingual retrieval;
- MiniLM-style sentence embeddings, publicly stated as 384 dimensions;
- CLIP image embeddings;
- optional image captions using Moondream where hardware permits;
- OCR for screenshots and scanned pages using platform paths;
- local grounded Q&A with numbered file citations;
- Qwen 2.5 named publicly as the local answer model;
- rank fusion and optional cross-encoder reranking;
- encrypted local database/vector state with a machine-bound key;
- file watching and incremental refresh;
- filters and saved views;
- document/media preview and matched-passage highlighting;
- duplicate/near-duplicate discovery;
- AI rename suggestions;
- resource governor, active hours, Performance and Gaming modes;
- current site showing 102 content-indexed file types;
- search continuing offline after activation/model download;
- current observed pricing of $2/month or $29 lifetime after a 14-day trial.

## Product feedback that becomes requirements

### 1. Index size is a product feature

The fresh Reddit thread immediately asks whether the index stays small. The author says the index grows primarily with extracted text/chunks, with a small vector per passage and per image, and cites testing on libraries over 100k files.

Therefore the owned product must expose:

- live index bytes;
- chunks/vectors/files counts;
- per-root contribution;
- forecast before first index;
- rebuild/compact controls;
- scale benchmarks.

### 2. The first index is the moment of truth

An earlier BeaconFind launch thread contains useful feedback that users need confidence before a local-AI scanner touches a large filesystem.

The owned product should add a **pre-index scan plan**:

- roots selected;
- excluded roots/types;
- estimated files/bytes;
- parser/OCR/image work classes;
- model/disk estimate;
- expected resource policy;
- explicit Start authorization.

### 3. Reliability is a first-class architecture concern

The public changelog shows recurring hard problems in this category: large-library memory pressure, malformed files, crash/restart loops, model-download retry, preview freezes, watcher refresh, image re-indexing, cancellation and resource contention.

The product must therefore have a quarantine/error queue, resumable indexing, atomic index generations, cancellation and measurable resource budgets before feature breadth.

## Clean-room boundary

Public behavior, documentation and independently observed runtime behavior may inform requirements.

Do not copy:

- BeaconFind name/branding/marketing copy;
- screenshots or protected visual trade dress;
- proprietary source code;
- private APIs;
- licensing internals/keys;
- private prompts or model-routing logic.

If a later authorized REA run inspects a shipped artifact, freeze exact artifact identity/hash and capture findings as `OBSERVED`, `DERIVED`, `HYPOTHESIS`, or `UNKNOWN`. Reconstructed/decompiled material must never be represented as original source.

## Internal placement

### Shared capability: Local Knowledge/Search Engine

Use Agent Work OS as the policy/evidence boundary:

```text
Work / Task
   |
   v
LocalRootGrant
   |
   v
Local Knowledge Provider
   |-- file observations
   |-- extraction/OCR
   |-- lexical index
   |-- vector index
   |-- image index
   |-- hybrid search
   |-- grounded answer
   |
   v
Evidence / Work Memory
```

Search authority is strictly narrower than arbitrary filesystem authority.

### Standalone product: Local Knowledge Desktop

Use the same search core behind a dedicated product surface:

- global search palette;
- full search window;
- preview/highlights;
- root/privacy/index controls;
- documents + code + images first;
- OCR;
- local answers with citations;
- CLI/local API/MCP lane;
- Windows/macOS and potentially Linux packages.

The standalone product should not be buried inside the Agent Work OS operator UI.

## MATCH / IMPROVE / NEW / OMIT

### MATCH

- local-first/offline architecture;
- global-hotkey search;
- semantic + BM25 + filename retrieval;
- multilingual search;
- OCR;
- image semantic search;
- watcher/incremental updates;
- previews/highlights;
- local grounded answers;
- saved filters/views;
- encrypted local index;
- resource-aware indexing.

### IMPROVE

- pre-index scan plan and explicit authorization;
- root grants with revocation receipts;
- per-document extraction/model/chunk provenance;
- score decomposition for explainable ranking;
- live index accounting and forecast;
- crash-safe resumable indexing;
- per-file quarantine;
- atomic generation swap;
- configurable extracted-text/caption/preview retention;
- provider/model abstraction;
- first-class CLI + local API/MCP;
- scale/relevance/recovery benchmarks;
- local-only/no-egress verification mode.

### NEW

- `local-root-grant/v1`
- `file-observation/v1`
- `extraction-receipt/v1`
- `chunk-manifest/v1`
- `embedding-receipt/v1`
- `index-generation/v1`
- `search-query/v1`
- `search-result/v1`
- `grounded-answer/v1`
- `index-health/v1`
- `resource-budget/v1`
- `search-benchmark-receipt/v1`

Later file effects such as rename/move/duplicate cleanup must use separate mutation grants.

### OMIT / DEFER

- donor branding/layout;
- license-system cloning;
- automatic destructive duplicate cleanup;
- unrestricted file actions from search results;
- cloud upload as default search path;
- video/audio transcription in Phase A;
- enterprise connectors before local correctness/scale/recovery are proven.

## Proposed architecture

```text
Desktop / CLI / MCP / Agent Tool
          |
          v
Query Router
  |-- exact / filename
  |-- BM25 / lexical
  |-- semantic text
  |-- image semantic
          |
          v
Rank Fusion
          |
          +--> optional Cross Encoder
          |
          v
Result Set
  |-- source freshness
  |-- score decomposition
  |-- matched passage
  |-- preview/highlight
          |
          +--> Open / Reveal
          |
          v
Local Grounded Answerer
          |
          v
Passage-bound Answer Receipt

Indexing plane:
Authorized Roots
  -> scan plan
  -> scanner/type router
  -> extractor/OCR/metadata/image pipeline
  -> FileObservation
  -> chunker
  -> lexical/vector/image indexes
  -> encrypted generation store
  -> atomic generation promotion
  -> watcher/incremental queue
  -> quarantine/error queue

Governance:
root grants + privacy policy + model/artifact manifests + resource budget
  -> evidence receipts
```

## Core invariants

1. Search results prove index matches, not current source freshness.
2. An AI answer cannot be stronger than cited source passages.
3. Search grants never imply arbitrary filesystem mutation authority.
4. One malformed file cannot block the whole library.
5. Queries can stay on the last healthy index generation while a new generation builds.
6. Resource behavior is policy-driven and measurable.
7. Generated search/index state is disposable without modifying source files.

## Candidate open-source donors/comparators

These require exact-SHA/license/dependency review before any direct reuse:

- `alpaim/vecDir` — MIT, Tauri/Rust/SQLite-oriented local multimodal semantic search.
- `AwesomeDog/soma` — MIT, local hybrid search with CLI/Web/API and broader media direction.
- `kernullist/CogniFind` — local hybrid search/OCR/resource-throttling comparator.
- `MalyStern/sift-file-search` — cross-platform local filename/content search comparator.
- `jiggersong/everythingsearch` — semantic local-file search comparator.

Default stance: behavior/reference first; direct code reuse only with pinned provenance and explicit license recording.

## Required negative/recovery tests

- path outside an authorized root is neither indexed nor revealed;
- symlink/junction/path traversal cannot escape root policy;
- exclusions survive restart;
- malformed/corrupt file cannot crash the global indexer;
- huge files hit parser/chunk ceilings;
- password-protected/unsupported files become explicit typed states;
- duplicate watcher events do not duplicate chunks/vectors;
- rename/move/delete reconciles without long-lived ghost results;
- source modification marks prior index result stale until refreshed;
- partial index generation cannot replace last healthy generation;
- key loss/corruption produces a recoverable reset path, never plaintext fallback;
- cancellation stops local model/GPU work;
- background indexing yields according to policy;
- answer cannot cite a passage absent from retrieved evidence;
- prompt injection inside documents remains untrusted source content;
- an agent cannot widen root scope by text instruction;
- no file/search/content telemetry leaves the machine in local-only mode;
- deleting the index never deletes source files.

## Phased execution plan

### P0 — evidence + REA packet

- [x] resolve source/product identity;
- [x] capture public architecture/features/pricing;
- [x] capture direct Reddit feedback;
- [x] capture current reliability/resource signals;
- [x] first-pass open-source donor scan;
- [ ] freeze evidence manifest/screens/demo flows;
- [ ] resolve and hash exact current Windows/macOS artifacts;
- [ ] execute authorized REA artifact/runtime investigation;
- [ ] produce evidence graph + unknowns.

### P1 — contracts + synthetic corpus

- [ ] freeze contracts;
- [ ] fixtures for txt/md/pdf/docx/xlsx/pptx/code/images/scanned PDF/email-like content;
- [ ] corrupt/huge/password-protected fixtures;
- [ ] digest/idempotency/restart tests;
- [ ] privacy/threat model.

### P2 — text search vertical slice

- [ ] scanner + scan plan;
- [ ] text/PDF/docx extraction;
- [ ] chunking;
- [ ] BM25/FTS;
- [ ] local embeddings;
- [ ] hybrid ranking;
- [ ] watcher;
- [ ] CLI/search UI;
- [ ] freshness verification.

### P3 — OCR + image search

- [ ] OCR adapter;
- [ ] image embeddings;
- [ ] thumbnails/previews;
- [ ] OCR/image provenance;
- [ ] image search benchmark corpus.

### P4 — grounded answers

- [ ] local model adapter;
- [ ] retrieved-context budget;
- [ ] passage/sentence citation binding;
- [ ] cancellation/streaming;
- [ ] insufficient-evidence state;
- [ ] hallucination/adversarial tests.

### P5 — scale/resource/recovery

- [ ] 1k/10k/100k library benchmarks;
- [ ] index size accounting;
- [ ] memory/CPU/GPU/battery budgets;
- [ ] crash/resume;
- [ ] quarantine;
- [ ] atomic generations;
- [ ] watcher-storm debounce;
- [ ] interrupted model-download recovery;
- [ ] startup corruption recovery.

### P6 — desktop product

- [ ] desktop shell;
- [ ] tray/menu-bar integration;
- [ ] global overlay;
- [ ] full search/preview UI;
- [ ] root grants/index health UI;
- [ ] Windows/macOS packaging;
- [ ] Linux decision;
- [ ] accessibility + keyboard UAT.

### P7 — Agent Work OS capability

- [ ] daemon-local provider;
- [ ] project/work root grants;
- [ ] `search_local_files` / `open_evidence_passage` tools;
- [ ] evidence binding into Work Memory;
- [ ] no path escape;
- [ ] approved file effects later.

### P8 — enterprise

- [ ] managed deployment;
- [ ] policy-managed roots/exclusions;
- [ ] no-egress audit mode;
- [ ] SBOM/model/license manifests;
- [ ] central policy without centralizing file content;
- [ ] health-only managed telemetry option;
- [ ] enterprise key/recovery design;
- [ ] offline update/model mirror.

### P9 — verification / replay / Shipping OS

- [ ] relevance golden corpus;
- [ ] deterministic replay/regression;
- [ ] exact-head CI;
- [ ] signed packages/digests;
- [ ] clean-machine install/reinstall/uninstall;
- [ ] firewall/no-egress verification;
- [ ] restart/recovery matrix;
- [ ] Windows/macOS real-device UAT;
- [ ] exact-SHA shipping receipt;
- [ ] production promotion only after Shipping OS gate.

## Product packaging hypothesis

### Community / free

- local lexical + semantic search;
- documents/code first;
- bounded roots;
- CLI + desktop search;
- offline/no-account core;
- open core where chosen licensing permits.

### Pro

- OCR + image search;
- local answers with citations;
- saved views;
- advanced previews;
- duplicate intelligence;
- rename suggestions;
- richer device support.

### Team / Enterprise

- centrally managed policy/root grants;
- deployment packaging;
- no-egress compliance mode;
- audit/health receipts;
- offline model/update mirrors;
- enterprise support;
- governed Agent Work OS/MCP integration;
- optional federation only after an explicit content-privacy architecture decision.

## REA work packet

Target:

- product: BeaconFind
- public mac artifact path observed: `https://releases.beaconfind.app/stable/latest/BeaconFind.dmg`
- exact current Windows artifact should be resolved/pinned before execution
- reconcile public artifact version against current updater/changelog

Requested REA evidence:

1. package identity and SHA-256;
2. Tauri/runtime/version evidence;
3. bundled libraries/models vs first-run downloads;
4. observable generated-state/file layout;
5. local DB/index format metadata;
6. process/subprocess model;
7. controlled network destination classes;
8. updater/license/model-download behavior;
9. watcher/restart/recovery behavior;
10. observable IPC/protocol surfaces;
11. evidence graph with limitations and unknowns.

Do not transplant proprietary code. Use REA only to validate/refine the independent behavioral specification.

## Next executable milestone

Freeze P1 contracts and build the smallest text-only hybrid-search slice:

`authorized root -> scan plan -> text extraction -> chunks -> BM25 + local embeddings -> hybrid results -> freshness check -> deterministic receipt`

That vertical slice must pass restart/idempotency/path-boundary tests before OCR, image search or local chat are added.
