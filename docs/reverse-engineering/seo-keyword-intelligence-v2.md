# REA Reconstruction: SEO Keyword Intelligence v2

Status: BUILD STARTED
Target: Reddit n8n long-tail keyword research workflow by u/cuebicai
Upstream reference: https://github.com/cuebicai/n8n-workflows/tree/main/longtail-keyword
Clean-room destination: `products/seo-keyword-intelligence/`

## 1. Source / Target Identity

Observed product behavior:

`seed keyword -> related keywords / keyword ideas / autocomplete -> keyword metrics -> Airtable`

Observed stack: n8n, Airtable, YepAPI, webhooks.

The upstream repository is MIT licensed, but this reconstruction intentionally does not copy the upstream workflow JSON or implementation. REA is used as an investigation/evidence provider only; Agent Work OS remains the orchestration, authorization, evidence, verification, and shipping authority.

## 2. Evidence and feedback captured

Primary target capabilities:
- webhook-triggered seed-keyword research
- multiple discovery paths
- keyword metrics enrichment
- structured records for downstream content planning
- status-aware workflow execution

Feedback-derived requirements:
- normalize before storage
- deduplicate exact and near-equivalent keywords
- cluster by topic and search intent
- preserve every source that produced a keyword
- rank clusters/opportunities instead of treating raw outputs as independent opportunities
- remove the single-provider dependency
- support low-cost/free discovery paths where possible
- perform an existing-content/cannibalization check before creating a new page
- add a SERP/intent re-check hook for ambiguous clusters
- retain human approval before downstream content generation or publishing
- recommend page type (article, comparison, landing page, collection/product support, or no-page) rather than assuming every keyword deserves a blog post
- expose confidence and evidence rather than only keyword volume/difficulty

## 3. Capability reconstruction

### Discovery layer
Provider-neutral `KeywordObservation` contract:

```json
{
  "keyword": "string",
  "source": "google-autocomplete|yepapi-related|yepapi-ideas|search-console|manual",
  "volume": 0,
  "difficulty": 0,
  "cpc": 0,
  "competition": 0,
  "intent": "informational|commercial|transactional|navigational|unknown",
  "metadata": {}
}
```

### Intelligence layer
Deterministic stages:
1. Unicode/case/whitespace normalization
2. Exact canonical dedupe
3. Near-duplicate collapse using token similarity
4. Source aggregation/provenance
5. Intent classification (provider intent first, deterministic heuristic fallback)
6. Topic-cluster generation
7. Opportunity score and confidence score
8. Page-type recommendation
9. Cannibalization/duplicate-content hook
10. Human-review gate

### Storage layer
The intelligence engine returns portable JSON. Airtable is an adapter, not the data model. Postgres/Sheets/Airtable/n8n Data Tables can be added without changing the core contract.

## 4. Key differences from target

| Area | Observed target | v2 reconstruction |
|---|---|---|
| Providers | Three paths through YepAPI | Provider-neutral, Google Autocomplete available without YepAPI; YepAPI optional |
| Dedupe | Not implemented | Exact + near duplicate collapse |
| Provenance | Path-specific only | All contributing sources retained |
| Intent | Later/manual | Provider + deterministic fallback |
| Clustering | Not implemented | Topic + intent clusters |
| Ranking | Raw metrics | Opportunity + confidence score |
| Content decision | Keyword records | Page-type recommendation + no-page option |
| Cannibalization | Not implemented | Existing-page hook |
| Human gate | Downstream/manual | Explicit review state in output contract |
| Storage | Airtable-coupled | Portable core; adapters separate |

## 5. Build acceptance criteria

- Input observations can come from more than one provider.
- Equivalent phrases collapse into one canonical opportunity while preserving aliases.
- A repeated keyword from multiple sources receives stronger evidence/confidence.
- Results are grouped into intent/topic clusters.
- Every result carries source provenance.
- Ranking is deterministic and testable.
- The engine works without external npm packages.
- n8n workflow is importable and can run in free-only mode with Google Autocomplete.
- YepAPI is optional and configured by environment/credential rather than hard-coded IDs.
- No Airtable base/table IDs or provider secrets are embedded.
- Downstream article generation is blocked until a human-review decision is present.

## 6. Shipping boundary

This branch is investigation/build only. No merge, production deployment, paid-provider write, or auto-publishing is authorized by this reconstruction. Shipping OS gates remain required for promotion beyond the branch.
