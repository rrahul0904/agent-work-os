# Wave 8 — customer authentication and dashboard isolation

Status: **implementation under test; production release remains NO-GO.**

## Why this is a release blocker

The original responsive web UI authenticated solely through a development `AGENT_WORK_OS_TOKEN` in localStorage and a WebSocket URL, while production control-plane APIs require PostgreSQL-backed authenticated account cookies, anti-CSRF headers and an explicitly selected organization ID. A production login page and correctly scoped dashboard were missing. In addition, the legacy `/api/state` and `/api/product` routes returned operator-global data and were not allowlisted for signed-in customer accounts.

## Implemented flow

1. `GET /api/client-config` exposes only whether the host accepts `account` authentication or local-development `local_token` mode. It never exposes secrets, organization IDs or model details.
2. Browser first discovers its server's authentication mode. Production/account mode clears the local developer bearer token, validates the current HttpOnly session through `GET /api/auth/me`, or renders email/password sign-in and organization signup.
3. A signed-in user selects an organization. The browser scopes both `/api/state?organizationId=` and `/api/product?organizationId=` to that organization; mutation requests carry the CSRF token returned by login/register/me.
4. Session starts and Shipping Runs include the selected `organizationId` for server-side authorization. WebSocket clients authenticate via the session cookie, **not a query-string bearer token**. Client event display is filtered to the active organization; the server independently restricts event delivery by membership.
5. Account logout invokes the authenticated CSRF-protected logout endpoint, revokes the server session, closes the socket and discards client secrets.
6. Local development without PostgreSQL retains the existing token-driven console for backwards compatibility, but the production account interface does not use localStorage tokens.

## Server security boundary

Account `GET /api/state` and `GET /api/product` now demand an explicit organization ID, validate membership and fetch tenant-specific machines/sessions/runs only. A tenant's product summary explicitly omits the operator's global filesystem portfolio and global committed receipts. `GET /api/portfolio` and `GET /api/receipts` stay denied to production account sessions. Authenticated `POST /api/shipping/contracts/validate` remains CSRF-protected. All unsafe actions still go through server-side role and machine validation.

These changes avoid accidental cross-tenant disclosure. They do not independently certify database roles, filesystem sandboxing, model quality, provider privacy, or deployment.

## Current limitations and launch blockers

- User portfolio registration and tenant-owned project management remain incomplete. Tenant product summaries intentionally show no operator-private projects; to populate a customer portfolio, build proper tenant-owned portfolio persistence rather than leaking global configuration.
- Public registration currently lacks verified email/invitation-only launch mode and password recovery. Do not open general public signup.
- UI browser automation against a real HTTPS deployment, accessibility, multi-organization UAT and penetration review remain pending.
- The existing Shipping Supervisor's internal SHIPPED label cannot serve as independent release certification; external readiness preflight and owner authorization remain mandatory.
- Token Intelligence PR #81 remains NO-GO on full-history secret-scan Issue #82 and dependency Issue #80.
- Provider-backed model usage, quota/metering, storage, billing, backup recovery, monitoring and rollback require verified production environment testing.
- Shipping target must be operator-approved AWS/OCI/on-prem, never Railway/Render/Vercel. No merge, production deploy, commercial usage or release certification is implied by this change.

## Verification

The existing PostgreSQL-backed identity API integration suite now includes server authentication-mode detection, missing/unauthorized organization negative tests, state and product isolation between two tenant accounts, denial of operator-global portfolio and receipts, and CSRF negative/positive tests. The JS browser syntax is included in CI. A separate independent browser UAT on real infrastructure remains mandatory.
