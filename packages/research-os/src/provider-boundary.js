import { isIP } from "node:net";
import { canonicalDigest, ResearchValidationError } from "./index.js";
import { createReaObservation } from "./collection.js";

// Only adapters created through this module can cross the fixture-only collector boundary.
// The runtime, not an LLM or retrieved document, must inject authorize and execute.
const guardedAdapters = new WeakSet();

export function isGuardedReadOnlyProvider(adapter) {
  return Boolean(adapter && typeof adapter === "object" && guardedAdapters.has(adapter));
}

export function createReadOnlySearchProvider({ id, revision, endpoint, authorize, execute }) {
  if (typeof authorize !== "function" || typeof execute !== "function") {
    throw new ResearchValidationError("read_only_provider_trusted_hooks_required");
  }
  const providerId = nonempty(id, "read_only_provider_id_invalid", 200);
  const providerRevision = nonempty(revision, "read_only_provider_revision_invalid", 200);
  const url = httpsUrl(endpoint, "read_only_provider_endpoint_invalid");
  const descriptor = {
    schema: "research-search-adapter/v1",
    id: providerId,
    revision: providerRevision,
    kind: "read-only-provider",
    networkAccess: true,
    allowedEffect: "network-read",
    endpointOrigin: url.origin,
    endpointPath: url.pathname
  };
  const metadata = Object.freeze({ ...descriptor, digest: canonicalDigest(descriptor) });
  const adapter = Object.freeze({
    metadata,
    async search(query, { queryId = null, limit = 10, retrievedAt = null } = {}) {
      const q = nonempty(query, "read_only_provider_query_invalid", 4000);
      const resolvedQueryId = queryId === null ? null : nonempty(queryId, "read_only_provider_query_id_invalid", 100);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new ResearchValidationError("read_only_provider_limit_invalid");
      }
      const queryDigest = canonicalDigest({ query: q, queryId: resolvedQueryId, limit });
      // Authorization runs for every query, not just once when configuring the adapter.
      const permission = await authorize(Object.freeze({
        effect: "network-read",
        adapterDigest: metadata.digest,
        endpointOrigin: metadata.endpointOrigin,
        queryDigest,
        requestedResults: limit
      }));
      checkPermission(permission, metadata, queryDigest, limit);

      // The injected executor is the only place where real provider I/O may occur.
      // This module intentionally has no fetch(), HTTP client, credentials or network access.
      const results = await execute(Object.freeze({
        endpoint: url.toString(),
        query: q,
        queryId: resolvedQueryId,
        limit
      }));
      if (!Array.isArray(results) || results.length > limit) {
        throw new ResearchValidationError("read_only_provider_results_invalid");
      }
      return results.map((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          throw new ResearchValidationError("read_only_provider_result_invalid");
        }
        const sourceUrl = httpsUrl(item.sourceUrl, "read_only_provider_source_url_invalid").toString();
        const excerpt = nonempty(item.excerpt, "read_only_provider_excerpt_invalid", 12000);
        const sourceTitle = nonempty(item.sourceTitle, "read_only_provider_title_invalid", 1000);
        return createReaObservation({
          evidence: {
            id: nonempty(item.id ?? `${resolvedQueryId ?? "query"}-${index + 1}`, "read_only_provider_evidence_id_invalid", 200),
            queryId: resolvedQueryId,
            sourceUrl,
            sourceTitle,
            excerpt,
            // Search snippets are unverified context, never self-certifying proof.
            classification: "derived",
            support: "context"
          },
          reaClass: "OBSERVED",
          sourceQuality: "unknown",
          retrievedAt,
          publishedAt: item.publishedAt ?? null,
          sourceSpan: { start: 0, end: excerpt.length },
          provenance: {
            provider: metadata.id,
            providerRevision: metadata.revision,
            providerDigest: metadata.digest,
            sourceRevision: item.sourceRevision ?? null
          }
        });
      });
    }
  });
  guardedAdapters.add(adapter);
  return adapter;
}

function checkPermission(value, metadata, queryDigest, limit) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.allowed !== true || value.effect !== "network-read"
    || value.adapterDigest !== metadata.digest
    || value.endpointOrigin !== metadata.endpointOrigin
    || value.queryDigest !== queryDigest
    || !Number.isSafeInteger(value.maxResults) || value.maxResults < limit) {
    throw new ResearchValidationError("read_only_provider_not_authorized");
  }
  if (typeof value.expiresAt !== "string"
    || !Number.isFinite(Date.parse(value.expiresAt))
    || Date.parse(value.expiresAt) <= Date.now()) {
    throw new ResearchValidationError("read_only_provider_grant_expired");
  }
}

function httpsUrl(value, code) {
  if (typeof value !== "string" || value.length > 4000) throw new ResearchValidationError(code);
  let url;
  try { url = new URL(value); } catch { throw new ResearchValidationError(code); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !host.includes(".") || isIP(host)
    || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
    || host.endsWith(".internal") || url.username || url.password || url.hash
    || (url.port && url.port !== "443")) {
    throw new ResearchValidationError(code);
  }
  return url;
}

function nonempty(value, code, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new ResearchValidationError(code);
  }
  return value.trim();
}
