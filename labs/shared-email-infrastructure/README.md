# Shared Email Infrastructure Lab — Roadmap + REA + Implementation OS

**Status: evidence-gated prototype only.** This lab neither imports into the Agent Work OS runtime nor changes email/DNS, secrets, production code, deployments or providers. No project is marked live.

## Source and evidence
- Donor: https://github.com/sums001/OpenInbox (MIT; upstream explicitly says beta, test on spare domain).
- Upstream: Cloudflare Email Routing -> Worker -> D1 for multi-domain human/shared mailboxes, optional R2 attachments and outbound sending via Resend, Brevo, Mailjet, SMTP or Cloudflare sending.
- **Do not conflate capabilities**: OpenInbox's provider delivery-status webhooks are present, but its general Inbox REST API and inbound-mail event webhooks remain listed as future work in the upstream README. Do not invent API endpoints.
- Pricing/quotas: Cloudflare and provider free tiers impose real Workers, storage, sending and attachment constraints. Cloudflare Email Sending to arbitrary recipients requires Workers Paid; receiving does not. Domain must be on Cloudflare DNS for Cloudflare Email Routing.

## Reusable architecture (separate planes)
1. **Human mailbox plane** — OpenInbox for support@, billing@, privacy@, sales@ and replies. Shared hosting only for low-risk projects, with explicit segregation tests.
2. **Transactional plane** — independently approved provider API/gateway for login codes, security alerts, billing receipts, exam and job notifications; server-side credentials, per-project sender identity, idempotency, rate limits, retry and bounce/suppression handling. No undocumented OpenInbox endpoints.
3. **Control plane** — this lab's candidate registry and deterministic fail-closed validation, eventual dashboard/owner approvals and evidence receipts.
4. **Project adapter plane** — individually reviewed opt-in integration PR per product; no auto-enablement or cross-project data sharing. For regulated/client/research data, exclude by default pending compliance review.

## REA sequence and gates
- **Research**: pin the donor commit, record license attribution, inspect auth, 2FA, sanitization, session/CSRF, attachment access, encryption/keys, update/migration and security/dependency status. Document clean-room/donor provenance.
- **Evaluate**: inventory current mail infrastructure, project ownership, existing domains, MX/DNS, sender reputation, transactional volume and local privacy/compliance needs. No assumptions based on project name.
- **Architect**: classify each project as shared human mailbox, dedicated mailbox, existing transactional provider, or excluded; isolate tenants and tokens.
- **Implementation**: configure an owned *spare* domain in an isolated Cloudflare account; deploy source-pinned instance; test end-to-end; feature-flag one noncritical project; expand via individually reviewed project PRs.
- **Recovery**: keep DNS rollback instructions, sender fallback strategy, encrypted backups and restore evidence. No automatic production DNS change.
- **Evidence**: exact-SHA tests and lint, dependency/security review, independent security sign-off, SMTP/provider send-reply UAT, SPF/DKIM/DMARC, spam/bounce/reply/attachment validation, quota failure, recovery, logs redaction and owner approval before rollout. Existing production NO-GO gates are unchanged.

## Runnable safety-gate slice

Use Node 22+:

    node labs/shared-email-infrastructure/src/preflight.mjs labs/shared-email-infrastructure/registry.candidates.json
    node --test labs/shared-email-infrastructure/test/preflight.test.mjs

The registry is explicitly a **non-exhaustive proposal**. All twelve projects are in candidate state without real domains or provider credentials. The code rejects duplicate project IDs, invalid aliases, duplicate mailbox ownership and premature pilot/enabled transitions without operator-provided DNS, security and owner-approval flags. Enabled projects also require live acceptance and a sender if transactional traffic is required. These boolean flags are *not* evidence by themselves: real DNS/provider checks must be independently verified and recorded.

## Portfolio waves (proposals, not implementation claims)
- **Wave 0 / donor audit**: inspect OpenInbox SHA and upstream licensing, source, security and test quality.
- **Wave 1 / low-risk mailbox pilot**: choose a noncritical owned domain and basic support inbox.
- **Wave 2 / owned SaaS**: Certification Factory, CodeAtlas, Snowflake Brain, Token Intelligence, AI Test Data Creator, Earth Reference Rebuild and similar customer-facing projects as individually verified.
- **Wave 3 / sensitive and event-heavy**: ApplyAI, Agent Work OS and interview/learning service only after stricter authorization, separate tenants and transactional deliverability UAT.
- **Excluded until separately cleared**: confidential client migrations, academic/research participant information, medical/regulated data, third-party owned domains.

## Acceptance / release rules
- No upgrades to OpenInbox via unreviewed automatic upstream sync; pin SHA/version and review migrations.
- No changing existing domain MX records or disabling current providers until fallback and DNS plan are approved.
- Do not reuse authentication or payment tokens across tenants.
- Do not label candidate entries deployed, live, compliant or security approved.
- Do not merge, publish or deploy based on a successful preflight alone. Owner authorization is required for live provider/DNS changes.

**Next evidence needed**: complete project tracker inventory and domain ownership, existing mail implementation per repo, Cloudflare account readiness, pilot-domain selection, independently reviewed donor security assessment, actual inbox send/receive/restore test receipts.
