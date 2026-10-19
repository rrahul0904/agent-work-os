import test from "node:test";
import assert from "node:assert/strict";
import { canonicalDigest, ResearchValidationError, createResearchBrief, planResearch } from "../src/index.js";
import { createReadOnlySearchProvider, isGuardedReadOnlyProvider } from "../src/provider-boundary.js";
import { collectResearchEvidence } from "../src/collection.js";

const expiresAt = "2099-01-01T00:00:00.000Z";
function permit(request) {
  return { ...request, allowed: true, maxResults: request.requestedResults, expiresAt };
}
function createProvider({ authorize = permit, execute = async () => [] } = {}) {
  return createReadOnlySearchProvider({
    id: "fixture-provider",
    revision: "pinned-v1",
    endpoint: "https://search.example.com/query",
    authorize,
    execute
  });
}
function sample(id = "e1") {
  return { id, sourceUrl: "https://example.org/evidence", sourceTitle: "Source", excerpt: "research evidence says X", classification: "primary", support: "supports" };
}
async function refused(fn, code) {
  await assert.rejects(fn, (error) => error instanceof ResearchValidationError && error.code === code);
}

test("provider boundary rejects constructors without trusted hooks, local origins and plaintext", () => {
  assert.throws(() => createReadOnlySearchProvider({ id: "x", revision: "1", endpoint: "https://example.com" }),
    (e) => e.code === "read_only_provider_trusted_hooks_required");
  for (const endpoint of ["http://search.example.com", "https://localhost/search", "https://127.0.0.1/path", "https://metadata.internal/query", "https://user:pass@example.com/query"]) {
    assert.throws(() => createReadOnlySearchProvider({ id: "x", revision: "1", endpoint, authorize: permit, execute: async () => [] }),
      (e) => e.code === "read_only_provider_endpoint_invalid");
  }
});

test("provider remains denied by default and never invokes executor on denial", async () => {
  let invoked = false;
  const p = createProvider({ authorize: async () => ({ allowed: false }), execute: async () => { invoked = true; return []; } });
  await refused(() => p.search("research", { queryId: "q1", limit: 1 }), "read_only_provider_not_authorized");
  assert.equal(invoked, false);
});

test("grant must bind query, adapter, origin, effect and minimum result limit", async () => {
  const invalid = [
    (p) => ({ ...p, queryDigest: "sha256:wrong" }),
    (p) => ({ ...p, adapterDigest: "sha256:wrong" }),
    (p) => ({ ...p, endpointOrigin: "https://other.example.com" }),
    (p) => ({ ...p, effect: "network-write" }),
    (p) => ({ ...p, maxResults: 0 })
  ];
  for (const mutate of invalid) {
    let invoked = 0;
    const adapter = createProvider({
      authorize: async (request) => mutate(permit(request)),
      execute: async () => { invoked++; return []; }
    });
    await refused(() => adapter.search("research", { queryId: "q1", limit: 1 }), "read_only_provider_not_authorized");
    assert.equal(invoked, 0);
  }
});

test("expired grant and provider over-result are rejected", async () => {
  const expired = createProvider({ authorize: async (request) => ({ ...permit(request), expiresAt: "2020-01-01T00:00:00Z" }) });
  await refused(() => expired.search("research", { queryId: "q1" }), "read_only_provider_grant_expired");
  const excessive = createProvider({ execute: async () => [sample("a"), sample("b")] });
  await refused(() => excessive.search("research", { queryId: "q1", limit: 1 }), "read_only_provider_results_invalid");
});

test("provider responses become contextual REA observations, not self-certified claims", async () => {
  let invoked = 0;
  const provider = createProvider({ execute: async ({ limit, queryId }) => {
    invoked++;
    assert.equal(limit, 2);
    assert.equal(queryId, "q1");
    return [sample()];
  } });
  assert.equal(isGuardedReadOnlyProvider(provider), true);
  const results = await provider.search("research evidence", { queryId: "q1", limit: 2, retrievedAt: "2026-10-19T16:00:00Z" });
  assert.equal(invoked, 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].evidence.support, "context");
  assert.equal(results[0].evidence.classification, "derived");
  assert.equal(results[0].sourceQuality, "unknown");
  assert.equal(results[0].provenance.providerDigest, provider.metadata.digest);
  assert.match(results[0].provenance.authorizationDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(results[0].sourceSpan.end, sample().excerpt.length);
});

test("collector accepts guarded read-only providers with an exact-query policy decision", async () => {
  const brief = createResearchBrief({ question: "research evidence", budget: { maxQueries: 1, maxEvidenceItems: 2 } });
  const plan = planResearch(brief);
  let approvals = 0;
  const provider = createProvider({
    authorize: async (request) => { approvals++; return permit(request); },
    execute: async () => [sample()]
  });
  const run = await collectResearchEvidence({ brief, plan, searchAdapter: provider, now: () => "2026-10-19T16:00:00Z" });
  assert.equal(approvals, 1);
  assert.equal(run.collection.adapterDigest, provider.metadata.digest);
  assert.equal(run.ledger.items.length, 1);
  assert.equal(run.ledger.items[0].support, "context");
  const replay = await collectResearchEvidence({ brief, plan, searchAdapter: provider, now: () => "2026-10-19T16:00:00Z" });
  assert.equal(run.collection.digest, replay.collection.digest);
});

test("collector refuses forged network adapter metadata even with valid digest", async () => {
  const brief = createResearchBrief({ question: "research evidence" });
  const plan = planResearch(brief);
  let invoked = 0;
  const raw = { schema: "research-search-adapter/v1", id: "forged", revision: "1", kind: "read-only-provider", networkAccess: true, endpointOrigin: "https://example.org" };
  const spoof = {
    metadata: { ...raw, digest: canonicalDigest(raw) },
    async search() { invoked++; return []; }
  };
  assert.equal(isGuardedReadOnlyProvider(spoof), false);
  await refused(() => collectResearchEvidence({ brief, plan, searchAdapter: spoof }), "search_adapter_network_forbidden_phase_a");
  assert.equal(invoked, 0);
});

test("source URLs are validated before entering research evidence", async () => {
  const provider = createProvider({ execute: async () => [sample("e1"), { ...sample("e2"), sourceUrl: "http://localhost/private" }] });
  await refused(() => provider.search("research", { queryId: "q1", limit: 2 }), "read_only_provider_source_url_invalid");
});
