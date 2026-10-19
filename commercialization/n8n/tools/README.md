# n8n REA ingestion and commercialization gates

This directory contains executable guardrails for converting external n8n references into evidence-backed commercial product candidates.

## Current pipeline

1. `reddit_source_inspector.py` classifies a Reddit source as either an unresolved short-share target or a canonical post identity.
2. `pending_reddit_targets.json` tracks unresolved targets without inflating the canonical product count.
3. `rea_gate.py` evaluates promotion state from identity through provenance, deduplication, clean-room status, implementation, E2E verification, packaging, and sellable-candidate state.
4. `test_*.py` protects the key invariants.
5. `.github/workflows/n8n-rea-gates.yml` runs the tests on changes to the commercialization/n8n area.

## Required invariant

A new Reddit URL is not a new SKU. A target may only become a new commercial lineage when its canonical source identity is known, evidence is captured, provenance is classified, and deduplication returns `NEW_LINEAGE`.

Third-party donor/reference material may never become sellable source merely by being copied into this repository. If provenance is `DONOR_REFERENCE`, the gate requires a clean-room rebuild before implementation can advance.

## Example

```bash
cd commercialization/n8n/tools
python reddit_source_inspector.py 'https://www.reddit.com/r/n8n_ai_agents/s/u61W83l1EV'
python -m unittest discover -p 'test_*.py' -v
python rea_gate.py ../evidence/example.json
```

## Promotion states

- `SOURCE_IDENTITY_BLOCKED`
- `EVIDENCE_PENDING`
- `PROVENANCE_PENDING`
- `CLEAN_ROOM_REQUIRED`
- `DEDUPE_PENDING`
- `FOLDED_EXISTING_LINEAGE`
- `CLEAN_ROOM_REBUILD`
- `IMPLEMENTATION_REQUIRED`
- `E2E_REQUIRED`
- `PACKAGE_REQUIRED`
- `SELLABLE_CANDIDATE`

Publishing remains a separate Shipping OS decision and is never implied by `SELLABLE_CANDIDATE`.
