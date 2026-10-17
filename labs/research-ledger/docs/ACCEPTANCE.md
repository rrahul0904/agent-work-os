# Research Ledger v0.3 acceptance

## Functional
- Upload TXT/MD/CSV/HTML and extract text locally.
- Upload PDF via browser PDF.js adapter and index extracted page text.
- Persist documents and explicit captured sources in IndexedDB across reloads.
- Run deterministic local lexical passage search without an API key.
- Run opt-in multilingual semantic passage search in a browser Web Worker without sending notebook passages through the application API.
- Semantic retrieval uses pinned `Xenova/multilingual-e5-small` revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`, Transformers.js `3.8.1`, `q8`, normalized mean pooling and E5 `query:` / `passage:` prefixes.
- First semantic use explicitly downloads/caches the pinned browser model; lexical remains available when model loading/inference fails.
- Semantic indexing is bounded to 240 chunks with deterministic round-robin source coverage and exact passage IDs.
- Grounded briefs default to deterministic **Lexical** retrieval.
- Users can explicitly select **Semantic · experimental** grounded briefs using the pinned E5 ranker.
- Users can explicitly select **Hybrid RRF · experimental** grounded briefs using reciprocal-rank fusion (`k=60`) over lexical and semantic ranks.
- Semantic/hybrid brief metadata records requested mode, effective mode, model revision, coverage and fallback state; hybrid also records rank overlap/fusion metadata.
- Any semantic/model/worker/bridge failure automatically degrades to lexical evidence selection and records the fallback instead of aborting the research run.
- Experimental ranked results are reconciled to exact local passages before brief rendering, including persisted-capture IDs that differ from current in-memory capture IDs.
- Ask a question and get an extractive grounded brief when live AI is unavailable.
- In live mode, send only the final bounded retrieved passages to `/api/research`.
- Click evidence IDs to open exact passages and expose page markers for PDF-derived text.
- Generate Summary, FAQ, Study Guide and Podcast transcript outputs; play podcast text with browser SpeechSynthesis.
- Save up to 50 durable research snapshots with evidence hashes; diff and replay older briefs without mutating evidence.
- Export/import the portable `research-ledger/notebook.v1` contract and export JSON/Markdown/Agent Work OS handoff JSON.
- Detect local evidence-set changes with SHA-256 and check explicitly captured public URLs through `/api/source-status`.

## Retrieval quality evidence
- Browser benchmark schema: `research-ledger/retrieval-benchmark.v2`.
- Exact benchmark head: `8a1c173342516fb3f37d74f75aded97f3cfe62d3`.
- Real Chromium workflow run: `38997319448`; job: `117292607265`.
- Receipt artifact: `12087960601`; digest `sha256:40377640c90b782bdc8f2a088c31388332fe217311d05921cf347f2d898f55c1`.
- Fixture: 20 queries, 15 passages, 8 language codes, exact/paraphrase/multilingual/noise/adversarial cases.
- Overall Recall@5 / MRR: Lexical **85.0% / 0.767**; Semantic **100.0% / 0.900**; Hybrid **100.0% / 0.867**.
- Multilingual subset (8 cases): Lexical **62.5% / 0.479**; Semantic **100.0% / 0.875**; Hybrid **100.0% / 0.792**.
- English subset (12 cases): Lexical **100% / 0.958**; Semantic **100% / 0.917**; Hybrid **100% / 0.917**.
- Benchmark decision: semantic is the fixture leader; `promoteHybridDefault=false`; `promotionEligibleOnFixture=false`.
- Product policy remains conservative: lexical stays default because it is zero-download and strong on English/exact/noise cases; semantic and hybrid remain explicit experimental options until representative real-notebook latency/quality/browser evidence is broader than this fixture.
- Full receipt and interpretation are recorded in `docs/RETRIEVAL_BENCHMARK.md`.

## Safety / privacy
- No passive browsing capture and no source HTML execution.
- No document upload to a provider unless bounded retrieved text is explicitly used for live generation.
- Semantic passage text is read from local IndexedDB and transferred only to the same-origin browser Web Worker for embedding.
- The semantic controller does not call application APIs; model/runtime assets download only after explicit semantic/hybrid use.
- CSP permits scoped WebAssembly compilation via `'wasm-unsafe-eval'` for ONNX Runtime Web and explicitly does **not** enable general JavaScript `'unsafe-eval'`.
- URL freshness checks refuse credential-bearing, localhost/private and IP-literal destinations; DNS answers are checked for private/non-routable ranges.
- Freshness HTTP/HTTPS connections are pinned to the already-vetted DNS answer; redirects are revalidated/re-resolved; sampling is capped at 64 KiB and eight URLs per request.
- Portable notebook import validates schema and bounded document/snapshot counts.
- Portable static hosting exposes only an explicit shipped browser asset allowlist.

## Verification
- Independent path-scoped `research-ledger-ci` executes `npm run check` from `labs/research-ledger` on relevant pushes/PRs.
- Syntax checks cover schema/app/completion, semantic worker/controller/core, experimental brief bridge, benchmark modules, APIs, portable server and tests.
- API/security, IndexedDB VM schema, semantic, semantic/hybrid brief, RRF, benchmark corpus/math and portable-runtime contracts must pass.
- Portable runtime smoke tests boot the real server and verify `/`, `/health`, `/api/research`, `/api/source-status`, benchmark page/assets, CSP, scoped Wasm support, HEAD behavior and package-file non-exposure.
- `research-ledger-benchmark` executes the real pinned model in Playwright Chromium and uploads the JSON quality receipt; inference-boundary changes such as CSP/server/model changes retrigger this workflow.

## Honest boundaries
- A 20-case curated fixture is quality evidence, not a production-wide accuracy claim.
- Single-case language rows are directional only.
- Lexical remains the default; semantic and hybrid are explicitly experimental.
- Semantic vectors remain worker-memory state and are rebuilt from local evidence; model/runtime browser caches may persist assets.
- Semantic coverage is capped at 240 chunks and reports partial coverage for larger notebooks.
- Encoded downloadable podcast audio and full multi-browser/capacity/accessibility benchmarking are not claimed complete.

## Release gate
- Vercel or alternate preview must deploy the exact final SHA.
- Live `/`, `/health`, `/api/research`, `/api/source-status`, semantic/hybrid/benchmark browser assets must return successfully.
- Production promotion remains a separate explicit gate.
