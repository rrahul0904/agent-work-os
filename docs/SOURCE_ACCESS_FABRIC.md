# Source Access Fabric

Source Access Fabric is the fail-closed bridge between REA source identity discovery and Agent Work OS Capability Fabric.

It exists for sources that are publicly identifiable in principle but cannot be resolved from the current execution context without an authenticated session or a real browser context. Reddit opaque `/s/` share links are the first concrete case.

## Why this exists

REA must not guess a reverse-engineering target when a short/share URL cannot be mapped to a canonical source with evidence. Anonymous retries also should not continue indefinitely once the upstream has demonstrated that access context is required.

The canonical transition is:

```text
opaque source URL
  -> bounded source identity resolver
  -> canonical target observed?
       yes -> TARGET_IDENTITY_RESOLVED -> REA_EVIDENCE_DISCOVERY
       no, 401/403 -> ACCESS_CONTEXT_REQUIRED
         -> source access request
         -> Capability Fabric resolves provider requirement
         -> provider is verified through existing governed verification path
         -> trusted access observation
         -> blocker-bound resume
         -> TARGET_IDENTITY_RESOLVED -> REA_EVIDENCE_DISCOVERY
       no, other failure -> TARGET_IDENTITY_UNRESOLVED -> STOP_AND_PRESERVE_EVIDENCE
```

## Contracts

### `source-identity-resolution/v1`

The source resolver records the requested URL, redirect provenance, resolved public addresses, target identity when known, error code, required capability, and an integrity digest.

Reddit 401/403 responses become:

```text
errorCode: ACCESS_CONTEXT_REQUIRED
requiredCapability: reddit-authenticated-or-browser-read
```

This is deliberately different from a generic retryable fetch failure.

### `source-access-request/v1`

Created only from an intact `ACCESS_CONTEXT_REQUIRED` source-resolution receipt. The request binds:

- source ID and requested URL,
- exact blocker receipt SHA-256,
- required capability,
- request timestamp,
- deterministic request identity,
- request SHA-256.

### `source-access-observation/v1`

A trusted provider can satisfy a source-access request by observing a canonical Reddit post URL. Current provider identities are:

- `reddit-authenticated-read`
- `browser-read`

The observation binds to the exact access request and blocker receipt and records an evidence reference. A canonical Reddit `/comments/<post-id>/...` URL is required; subreddit landing pages or arbitrary redirects do not satisfy the contract.

### `source-intake-transition/v1`

The intake state machine emits one of three gates:

- `TARGET_IDENTITY_RESOLVED`
- `ACCESS_CONTEXT_REQUIRED`
- `TARGET_IDENTITY_UNRESOLVED`

A resolved transition advances to `REA_EVIDENCE_DISCOVERY`. A blocked transition advances to `ACQUIRE_SOURCE_ACCESS_CONTEXT`. Non-access failures stop and preserve evidence instead of fabricating a target.

## Anti-replay rule

A browser or authenticated observation is not portable between blockers. The observation must match the exact:

- access request ID,
- access request digest,
- blocker receipt digest,
- source ID,
- originally requested URL.

An observation from another target, retry, or blocker is rejected even if it contains a syntactically valid Reddit URL.

## Capability Fabric bridge

`packages/capability-fabric/src/source-access.js` maps the union requirement:

```text
reddit-authenticated-or-browser-read
```

into provider candidates:

```text
reddit-authenticated-read
browser-read
```

If neither capability is present in the registry, the plan remains `missing` and requests installation/connection. Agent Work OS does not pretend access exists.

If a matching capability is present, the plan becomes `available` and advances to `VERIFY_SOURCE_ACCESS_CAPABILITY`. Selection is bound to the exact source-intake transition.

The existing Capability Fabric verification/daemon path remains the authority for proving an installed capability before it is used. This module does not bypass verification, approval, or credential boundaries.

## CLI

Resolve an opaque Reddit share URL:

```bash
node scripts/resolve-source-identity.mjs rea-229 'https://www.reddit.com/r/BestGitHubRepos/s/<token>' > blocked.json
```

When the result requires access context, generate the access package:

```bash
node scripts/source-intake.mjs blocked.json
```

Once a trusted browser or authenticated Reddit provider has observed the canonical post URL, resume the same intake:

```bash
node scripts/source-intake.mjs blocked.json \
  --provider browser-read \
  --canonical-url 'https://www.reddit.com/r/<subreddit>/comments/<post-id>/<slug>/' \
  --evidence-ref 'browser-session:<receipt-or-session-id>'
```

The output contains the source-resolution receipt, access request, access observation when supplied, and the resulting intake transition.

## Security boundary

Source Access Fabric is read-oriented and does not authorize external writes. It does not store Reddit credentials, browser cookies, or provider secrets inside source receipts. Credential/session acquisition remains a separate governed capability and secret boundary.

The resolver retains the existing Source Fabric network rules:

- HTTPS only,
- public DNS/IP destinations only,
- no credential-bearing URLs,
- no non-default HTTPS ports,
- bounded redirects,
- per-hop host revalidation,
- Reddit-host boundary for Reddit share resolution.

## Current REA #229 state

For the captured opaque Reddit share target, anonymous direct resolution and Reddit's public `/api/info?url=...` path both returned HTTP 403 before revealing the canonical post identity. Therefore the correct current gate is `ACCESS_CONTEXT_REQUIRED`, not target classification.

Repository routing, license/SHA capture, capability extraction, and clean-room implementation remain blocked until a trusted provider produces the canonical target observation.