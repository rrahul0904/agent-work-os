# Retrieval benchmark receipt — Research Ledger v0.3

## Purpose

This receipt records the first expanded real-browser comparison of Research Ledger lexical, semantic and hybrid retrieval. It is a product-quality signal, not a claim that a 20-case synthetic fixture represents all production notebooks.

## Reproducible execution

- Benchmark schema: `research-ledger/retrieval-benchmark.v2`
- Exact benchmark head: `8a1c173342516fb3f37d74f75aded97f3cfe62d3`
- GitHub Actions workflow: `research-ledger-benchmark`
- PR run ID: `38997319448`
- Benchmark job ID: `117292607265`
- Artifact ID: `12087960601`
- Artifact digest: `sha256:40377640c90b782bdc8f2a088c31388332fe217311d05921cf347f2d898f55c1`
- Runner: headless Playwright Chromium
- Cases: 20
- Corpus passages: 15
- Evaluation: Recall@5 and mean reciprocal rank (MRR)
- Model: `Xenova/multilingual-e5-small`
- Model revision: `761b726dd34fb83930e26aab4e9ac3899aa1fa78`
- Transformers.js: `3.8.1`
- Quantization: `q8`
- Embedding behavior: normalized mean pooling with E5 `query:` / `passage:` prefixes

The workflow downloaded the model in a cold CI browser, embedded the fixture locally in the Web Worker, executed all cases, wrote `retrieval-benchmark-receipt.json`, and uploaded the JSON receipt as the artifact above.

## Overall results

| Retrieval mode | Recall@5 | MRR |
|---|---:|---:|
| Lexical | 85.0% | 0.767 |
| Semantic E5 | **100.0%** | **0.900** |
| Hybrid RRF | **100.0%** | 0.867 |

**Fixture leader: Semantic E5.** Semantic matched hybrid recall and ranked the relevant passage earlier on average.

## Results by query type

| Query type | Cases | Lexical Recall / MRR | Semantic Recall / MRR | Hybrid Recall / MRR |
|---|---:|---:|---:|---:|
| Exact | 3 | 100% / 1.000 | 100% / 1.000 | 100% / 1.000 |
| Paraphrase | 5 | 100% / 1.000 | 100% / 1.000 | 100% / 1.000 |
| Multilingual | 8 | 62.5% / 0.479 | **100% / 0.875** | 100% / 0.792 |
| Noise | 2 | **100% / 1.000** | 100% / 0.750 | 100% / 0.750 |
| Adversarial | 2 | 100% / 0.750 | 100% / 0.750 | 100% / 0.750 |

The largest semantic advantage came from multilingual queries. Lexical ranking remained especially strong for English/noisy keyword-heavy queries.

## Language breakdown

| Language | Cases | Lexical Recall / MRR | Semantic Recall / MRR | Hybrid Recall / MRR |
|---|---:|---:|---:|---:|
| English (`en`) | 12 | **100% / 0.958** | 100% / 0.917 | 100% / 0.917 |
| Spanish (`es`) | 2 | 50% / 0.167 | **100% / 0.750** | 100% / 0.417 |
| German (`de`) | 1 | 100% / 0.500 | 100% / 0.500 | 100% / 0.500 |
| French (`fr`) | 1 | 100% / 1.000 | 100% / 1.000 | 100% / 1.000 |
| Hindi (`hi`) | 1 | 0% / 0.000 | **100% / 1.000** | 100% / 1.000 |
| Italian (`it`) | 1 | 100% / 1.000 | 100% / 1.000 | 100% / 1.000 |
| Japanese (`ja`) | 1 | 0% / 0.000 | **100% / 1.000** | 100% / 1.000 |
| Portuguese (`pt`) | 1 | 100% / 1.000 | 100% / 1.000 | 100% / 1.000 |

Single-case languages are directional evidence only. They are not statistically sufficient language-specific quality claims.

## Product decision

The receipt intentionally records:

- `promoteHybridDefault: false`
- `promotionEligibleOnFixture: false`
- `fixtureLeader: semantic`
- `fixtureSignal: semantic-ranks-better-than-hybrid`

Current product policy:

1. **Lexical remains the default.** It has zero model-download cost, is deterministic, and performed extremely well on the English/exact/paraphrase/noise portions of this fixture.
2. **Semantic E5 is an explicit experimental brief/search mode.** The real-browser fixture provides evidence that it materially improves multilingual recall and overall rank quality.
3. **Hybrid RRF remains experimental.** Equal-weight RRF protected recall but sometimes allowed lexical distractors to demote the correct semantic passage, reducing MRR versus semantic alone.
4. No mode is auto-promoted from this fixture. A default change requires representative real-notebook evaluation, latency/memory measurements, and browser/device compatibility evidence in addition to retrieval quality.

## Runtime finding

The first cold-browser benchmark exposed a CSP incompatibility: ONNX Runtime Web needed WebAssembly compilation while the application CSP did not permit it. The runtime was corrected to include scoped `'wasm-unsafe-eval'` while continuing to refuse general JavaScript `'unsafe-eval'`. After that change, the real browser benchmark completed successfully. This is now enforced by portable-runtime smoke tests and the benchmark workflow is triggered by CSP/runtime changes.

## Remaining quality lanes

- Expand evaluation with representative imported notebooks rather than only a curated fixture.
- Measure cold/warm model load latency, indexing time, memory use and query latency across notebook sizes.
- Test Safari/WebKit and Firefox in addition to Chromium where WebAssembly/model runtime support allows.
- Evaluate semantic-only versus tuned/weighted fusion before changing RRF behavior.
- Keep exact passage verification and lexical fallback as hard safety/reliability boundaries.
