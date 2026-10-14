# ADR-004: First-Party Identity Boundary

Status: Accepted for the initial identity slice; not a production launch decision.

## Decision

- Customer REST requests authenticate as a user through a revocable, expiring server-side PostgreSQL session.
- Session secrets are random, stored only as SHA-256 digests, and delivered in `HttpOnly` cookies (`SameSite=Strict` by default). Cross-site deployments can explicitly select `SameSite=None` over production HTTPS. Cookie-authenticated mutations require a double-submit CSRF token.
- Registration and login attempts use PostgreSQL-backed rate limits shared across API instances; forwarded client IPs are trusted only when proxy trust is explicitly enabled.
- Production daemons authenticate with revocable, organization-bound machine credentials sent in the first WebSocket protocol message. Machine REST credentials can read only sessions assigned to that machine and organization. The legacy shared daemon token remains local-development-only.
- Registration creates an organization and Owner membership. Invitations are email-bound, expiring, one-time tokens stored as hashes; roles are Owner, Admin, Member, and Viewer.
- API handlers derive `createdBy` from the authenticated user and verify membership server-side before WorkItem access. A caller-provided organization ID selects a requested scope but never proves membership.
- The legacy bearer token authenticates only the local-development compatibility path. Production customer requests require user sessions; production daemons require machine credentials.
- Authenticated users receive no access to legacy global Session, Machine, ShippingRun, or portfolio state until each resource has canonical organization ownership and scoped repository queries.
- CORS defaults to same-origin and supports an explicit origin allowlist. Production startup requires PostgreSQL and an explicitly configured daemon credential.

## Consequences and remaining work

This boundary supports account, organization, invitation, machine enrollment, scoped session, WorkItem, and event flows while keeping legacy global endpoints inaccessible to customer sessions. It does not yet provide verified email, recovery, external IdP/SSO, invitation delivery, audit history, bot controls, or full resource normalization. Session and machine records still live in a global JSONB snapshot with process-local cache and no safe multi-instance write coordination. Production must remain single-instance until those persistence and routing limits are resolved.

The JSON compatibility store remains local-development-only for identity. PostgreSQL migrations preserve legacy WorkItems by placing their organization IDs in unowned imported organizations; this does not grant any user access to those records.
