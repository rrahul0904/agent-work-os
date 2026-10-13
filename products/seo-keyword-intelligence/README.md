# SEO Keyword Intelligence v2

A clean-room, provider-neutral reconstruction of the long-tail keyword research pattern observed in the referenced n8n workflow, improved using the strongest Reddit feedback.

This is not "26 API rows in a table." The product goal is a smaller, evidence-backed set of keyword opportunities that a human can actually use.

## What v0.1 already does

- normalizes keyword text
- exact deduplication
- near-duplicate collapse
- preserves aliases and every contributing provider/source
- deterministic intent fallback
- topic/intent clusters
- opportunity scoring
- confidence scoring from evidence/source diversity/metric completeness
- page-type recommendation
- explicit `needs-human-review` state
- zero runtime npm dependencies

## Why this is better than the observed workflow

The observed flow uses related keywords, keyword ideas, and autocomplete as separate paths, but all three ultimately depend on YepAPI. Reddit feedback correctly pointed out that this is still a single-provider system and that raw outputs should be normalized, deduplicated, clustered, source-attributed, and ranked before being treated as opportunities.

v2 therefore separates:

`provider observation -> normalization -> dedupe -> evidence aggregation -> intent -> clustering -> ranking -> content decision -> human gate`

Airtable is optional. The intelligence output is plain JSON so the same engine can feed Airtable, n8n Data Tables, Postgres, Sheets, Supabase, a web UI, or another workflow.

## Observation contract

```json
{
  "keyword": "best n8n hosting",
  "source": "google-autocomplete",
  "volume": 3500,
  "difficulty": 22,
  "cpc": 8.2,
  "competition": 0.71,
  "intent": "commercial"
}
```

Only `keyword` is required. Missing metrics remain null instead of being invented.

## Run locally

```bash
cd products/seo-keyword-intelligence
npm test
printf '%s' '{"observations":[{"keyword":"best n8n hosting","source":"google-autocomplete"}]}' | npm run analyze
```

## Recommended provider mix

The engine does not require any specific provider. A useful production mix is:

1. **Free discovery:** autocomplete or another low-cost suggestion source.
2. **First-party evidence:** Google Search Console where the site already has impressions/rankings.
3. **Metrics provider:** YepAPI, DataForSEO, Ahrefs/Semrush export, or another provider.
4. **SERP evidence:** top-result titles/URLs for ambiguous intent clusters.
5. **Existing-site inventory:** current URLs/titles to prevent cannibalization.

The engine's `source` field is deliberately open-ended so new providers can be added without schema changes.

## Suggested n8n product architecture

```text
Webhook / Form / Airtable button
        |
        v
Validate seed + locale
        |
        +------------------+------------------+------------------+
        |                  |                  |                  |
  autocomplete       metrics API       Search Console      manual import
        |                  |                  |                  |
        +------------------+------------------+------------------+
                           |
                           v
                 KeywordObservation[]
                           |
                           v
              SEO Keyword Intelligence
                           |
        normalize -> dedupe -> sources -> intent
                 -> cluster -> score -> page type
                           |
                           v
                 Cannibalization check
                           |
                           v
                    HUMAN REVIEW
                           |
              +------------+-------------+
              |                          |
          approved                     rejected
              |                          |
              v                          v
      subtopic / brief stage          archive
```

## Ranking philosophy

The score is intentionally not a fake "SEO truth" score. It is a deterministic triage score built from the evidence available:

- search demand when provided
- inverse difficulty when provided
- CPC/commercial signal when provided
- intent
- number of independent sources
- metric completeness
- repeated/alias evidence

Provider data remains visible so a reviewer can disagree with the score.

## Content/cannibalization gate

Before article generation, add an adapter that receives the opportunity plus the site's existing URL/title/keyword inventory and returns one of:

- `create-new-page`
- `update-existing-page`
- `merge-with-existing-cluster`
- `no-page`
- `needs-serp-review`

The product must not auto-publish content from raw keyword output.

## Packaging / monetization direction

A strong commercial package is larger than one JSON file:

- free/community n8n template: discovery + dedupe + source tracking
- pro workflow pack: metrics adapters, Search Console, cannibalization, SERP re-check, Airtable/Sheets/Postgres adapters
- hosted product: UI, workspaces, runs, cost controls, cluster review, exports
- agency edition: multi-client workspaces, white-label reports, approval queues, quotas and audit history

## Current status

v0.1 core intelligence engine and deterministic tests are implemented on the reconstruction branch. n8n provider/storage adapters are the next build slice. No production deployment or auto-publishing is included in this branch.
