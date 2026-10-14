# Sentinel Reliability Pack

SKU: `N8N-RELIABILITY-001`
Status: `PACKAGE_REQUIRED`

## Promise
Production-hardening patterns for n8n: circuit breaking, exponential backoff with jitter, dead-letter routing, recovery probes, idempotency guidance and observability patterns.

## Buyer
- n8n consultants
- automation agencies
- internal platform teams
- developers running business-critical workflows

## Commercial positioning
The existing community/open-source Sentinel implementation remains a reference/community edition. The paid product must add independently authored commercial value rather than charging for the unchanged public MIT artifact.

## Editions

### Reliability Pack — $79
- production circuit-breaker template
- DLQ pattern
- retry/backoff templates
- incident runbook
- test harness and failure simulations

### Production Engineering Pack — $199
- everything in Reliability Pack
- Postgres-backed state pattern
- idempotency pattern
- structured telemetry schema
- deployment/upgrade guidance
- reusable health-check/recovery subflows
- architecture diagrams

### Team Implementation — from $1,000
- review one customer workflow
- install resilience patterns
- failure-injection test
- handoff report

## Release gates

- clearly document what is community/open source versus paid commercial additions
- validate concurrent executions and state behavior for each supported deployment model
- demonstrate 2xx, 4xx, 5xx, timeout, rate-limit and recovery paths
- version compatibility matrix
- zero secrets in package
- exact-SHA release receipt with test evidence
