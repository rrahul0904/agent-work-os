# Research OS — trusted read-only provider boundary

Status: **IMPLEMENTED ON DRAFT FEATURE BRANCH; LIVE PROVIDER NOT CONNECTED; EXACT-HEAD CI / SECURITY REVIEW REQUIRED.**

Related work: governance issue #211, Evaluation Harness issue #111, draft PR #232.

## Architecture boundary

A research plan, retrieved document, provider snippet, prompt or LLM response **cannot** authorize network access. Only an Agent Work OS runtime-controlled integration may construct a provider adapter and supply **both** the `authorize` callback and the `execute` function.

`createReadOnlySearchProvider({ id, revision, endpoint, authorize, execute })` is provider-neutral. It does not import a network client, credentials, or fetch data itself.

For each bounded search query:

1. The adapter constructs a canonical query digest, endpoint origin, expected adapter digest and `network-read` effect.
2. The trusted `authorize` callback must approve that **specific** request. An allow flag alone is inadequate: effect, origin, adapter digest, query digest, result limit and nonexpired authorization must all match.
3. Only then is the trusted `execute` callback invoked. The executor must independently enforce network egress restrictions, TLS/DNS/IP policy, redirects, method restrictions, credential scoping and timeouts. The current adapter is **not** a sandbox or an SSRF firewall.
4. The returned response is capped by the requested result limit. Snippets are recorded as `derived` / `context` with source quality `unknown`, not automatically treated as facts supporting a claim.
5. REA observations include the provider ID/revision/digest, exact source URL, source span, retrieval time and a canonical `authorizationDigest` derived only from nonsecret grant fields.
6. `collectResearchEvidence` admits only registered guarded read-only provider instances. Merely changing or forging adapter metadata to `networkAccess:true` is rejected.

The internal WeakSet protects the collector's opt-in gate from metadata-only spoofing **within the Node process**. It does not authenticate the external provider or protect a hostile process able to run arbitrary code in the host. The authorize/execute hooks must be instantiated by a trusted daemon or service layer, never deserialized from a ProjectSpec, prompt or model response.

## Runtime integration TODO (not completed)

- Bind the adapter factory only in the trusted Agent Work OS runtime/provider registry.
- Define a durable, revocable user/operator consent and egress policy; use the runtime's existing authorization gate.
- Add a real read-only search implementation with server-side DNS/IP/redirect checks and secret isolation.
- Normalize rate-limit, retry, timeout, token, latency and cost observations into the evaluation harness.
- Implement independent full-page fetch + passage extraction and semantic support assessment. **Search-result excerpts are not sufficient to verify claims.**
- Independently assess prompt-injection, replay and provider-response contamination risks.
- Perform end-to-end UAT, negative network tests, and exact-SHA CI/Shipping OS receipts before any deployment.

## Negative tests

The `packages/research-os/test/provider-boundary.test.js` suite includes missing trusted hooks, unsafe endpoint schemes/hosts, default-deny, query/adapter/origin/effect mismatch, expired grants, overlimit results, forged adapter metadata, unsafe citation URLs, and a legitimate injected fixture executor with replay-stable observations.

No real network provider, live credential, external write, production deployment, or product UAT is claimed by these tests.
