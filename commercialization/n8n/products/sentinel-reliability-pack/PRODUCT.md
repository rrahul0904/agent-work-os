# Sentinel Production Engineering Pack

SKU: `N8N-RELIABILITY-001`
Status: `PACKAGE_REQUIRED`

## Promise
Production-hardening patterns and engineering support for n8n: three-state circuit breaking, bounded exponential backoff with full jitter, dead-letter routing, recovery probes, deterministic idempotency keys, replay-ready DLQ records, safe-disable behavior, failure simulation and deployment guidance.

## Buyer
- n8n consultants
- automation agencies
- internal platform teams
- developers running business-critical workflows

## Commercial positioning
The existing Sentinel workflow remains MIT-licensed free core. We do **not** charge customers for pretending that open-source code is proprietary. Paid value is the separately authored production contract/test layer, deployment engineering, topology review, upgrades, runbooks and support.

## Editions

### Reliability Engineering Pack — $79
- attributed MIT free-core workflow reference
- independently authored deterministic circuit-state contract model
- DLQ/replay contract
- idempotency-key contract
- jitter/recovery/safe-disable tests
- incident/recovery guidance

### Production Engineering Pack — $199
- everything in Reliability Engineering Pack
- 10,000-cycle deterministic transition soak test
- production topology/persistence decision guide
- structured failure/replay contract
- compatibility/release receipt
- deployment/upgrade guidance
- support boundary and implementation checklist

### Team Implementation — from $1,000
- review one customer workflow
- install/configure resilience patterns
- document persistence choice for the customer topology
- failure-injection test
- handoff report

## Explicit non-claim
The current package does **not** yet ship a generic Postgres/Redis state adapter as completed product code. The free reference workflow uses n8n workflow static data. Durable external-state implementation is a separately scoped enhancement when the customer's multi-worker/high-availability topology requires it.

## Evidence already built
- deterministic CLOSED/OPEN/HALF_OPEN contract
- safe-disable routing
- threshold/open shielding behavior
- heartbeat recovery
- failed-canary reopen behavior
- bounded jitter
- stable idempotency keys
- replay-context DLQ records
- 10,000 deterministic failure/recovery cycles

## Remaining release gates
- import exact free-core workflow into the supported n8n release
- exercise workflow behavior in n8n, not only the separately authored contract model
- confirm zero-secrets package and compatibility boundary
- exact-SHA release receipt

Do not mark `SELLABLE` until those runtime gates pass.
