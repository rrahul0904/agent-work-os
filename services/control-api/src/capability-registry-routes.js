import { assertCapabilitySpec } from "../../../packages/capability-fabric/src/index.js";

export async function handleCapabilityRegistryRequest({
  req,
  res,
  url,
  principal,
  identities,
  registry,
  readJson,
  json
}) {
  if (principal?.kind !== "user") return false;

  if (url.pathname === "/api/capabilities" && req.method === "GET") {
    const organizationId = url.searchParams.get("organizationId");
    if (!organizationId) {
      json(res, 400, { error: "organization_id_required" });
      return true;
    }
    if (!(await identities.getMembership(principal.userId, organizationId))) {
      json(res, 404, { error: "organization_not_found" });
      return true;
    }
    const filters = {
      kind: url.searchParams.get("kind") || undefined,
      tag: url.searchParams.get("tag") || undefined,
      sourceUrl: url.searchParams.get("sourceUrl") || undefined,
      allVersions: url.searchParams.get("allVersions") === "true"
    };
    json(res, 200, { capabilities: await registry.listByOrganization(organizationId, filters) });
    return true;
  }

  if (url.pathname === "/api/capabilities" && req.method === "POST") {
    const body = await readJson(req);
    if (!body.organizationId || !body.spec) {
      json(res, 400, { error: "organizationId and spec are required" });
      return true;
    }
    const membership = await identities.getMembership(principal.userId, body.organizationId);
    if (!membership) {
      json(res, 404, { error: "organization_not_found" });
      return true;
    }
    if (membership.role === "viewer") {
      json(res, 403, { error: "organization_permission_denied" });
      return true;
    }
    const entry = await registry.add(body.organizationId, assertCapabilitySpec(body.spec), { createdBy: principal.userId });
    json(res, 201, entry);
    return true;
  }

  const capabilityMatch = url.pathname.match(/^\/api\/capabilities\/([^/]+)$/);
  if (req.method === "GET" && capabilityMatch) {
    const organizationId = url.searchParams.get("organizationId");
    if (!organizationId || !(await identities.getMembership(principal.userId, organizationId))) {
      json(res, 404, { error: "capability_not_found" });
      return true;
    }
    const slug = decodeURIComponent(capabilityMatch[1]);
    const version = url.searchParams.get("version") || null;
    const entry = await registry.resolve(organizationId, slug, version);
    json(res, entry ? 200 : 404, entry ?? { error: "capability_not_found" });
    return true;
  }

  return false;
}

export async function resolveVerificationCapabilitySpec(registry, organizationId, body) {
  if (body?.spec) return assertCapabilitySpec(body.spec);
  const slug = body?.capabilitySlug;
  if (!slug) return null;
  const entry = await registry.resolve(organizationId, slug, body.capabilityVersion ?? null);
  return entry?.spec ?? null;
}
