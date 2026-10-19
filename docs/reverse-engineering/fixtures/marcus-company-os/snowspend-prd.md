# SnowSpend Lab — Phase A PRD

Status: source-owned synthetic Company OS fixture  
Parent: Agent Work OS #234  
Runtime scope: local/static only; no production Snowflake, email, social, legal, payment, CRM, or deployment effects.

## Problem

Mid-sized Snowflake users can struggle to turn warehouse-usage data into a prioritized explanation of where spend is concentrated and which optimization actions deserve investigation first.

## Phase A user

A data-platform lead evaluating a cost-observability workflow using entirely synthetic warehouse and query-cost data.

## Value proposition

Turn a synthetic usage/cost fixture into an explainable cost-driver dashboard, prioritized findings, and evidence-linked recommendations. The fixture demonstrates how Company OS can take a founder intent through product specification, implementation evidence, review, and launch-readiness truth without connecting to a real customer's systems.

## Phase A outcomes

1. Show synthetic total monthly spend and cost drivers by warehouse/workload.
2. Highlight clearly labeled synthetic findings such as idle clusters, oversized warehouses, and repeated expensive query patterns.
3. Produce recommendations with explicit evidence references and estimated savings labeled as estimates, never verified business outcomes.
4. Expose the Company OS Evidence Board and workstream state alongside the product fixture.
5. Allow only local demo interactions and draft-only growth/BDR/fundraising artifacts.

## Product surfaces

- Executive spend summary.
- Synthetic warehouse/workload table.
- Cost-driver findings.
- Recommendation cards with evidence and estimate labels.
- Company OS objective/workstream panel.
- Evidence Board showing `passed | planned | blocked | unknown` without fabricating completion.
- Blocker simulation for external-provider approval.
- Draft-launch-copy preview; never send/publish.

## Synthetic fixture

The first authored dataset models three warehouses/workloads with invented costs and utilization:

| Workload | Monthly cost | Utilization | Synthetic finding |
| --- | ---: | ---: | --- |
| BI_ANALYTICS | $18,420 | 38% | Oversized periods / idle runtime |
| ELT_BATCH | $11,760 | 71% | Repeated high-cost transformation windows |
| ADHOC_DEV | $6,380 | 22% | Low utilization / long auto-suspend window |

Total synthetic monthly cost: **$36,560**.

These values are authored fixtures and are not customer data, market evidence, Snowflake benchmark data, or savings guarantees.

## Acceptance criteria

- Static fixture loads without external network dependencies.
- Every cost number is labeled synthetic.
- No production credential or customer/prospect record is embedded.
- No `fetch`/XHR/webhook/provider action exists in the fixture JavaScript.
- Growth/BDR/fundraising interactions are draft-only.
- Evidence Board cannot label preview/browser/replay as passed merely because the page renders locally.
- Company OS launch certificate remains unavailable until required evidence is independently recorded by the core state model.
- Keyboard-accessible controls and readable semantic HTML are used.

## Explicit non-goals

- Live Snowflake connection or cost ingestion.
- Cost-saving guarantees.
- Automated warehouse resizing/suspension.
- Real outreach or social publishing.
- Real investor/prospect sourcing.
- Incorporation/legal filing.
- Payments or credit-card access.
- Production deployment or `SHIPPED` status.
