import { WorkMemoryHandoffError } from "./work-memory-handoff.js";
import { WorkMemoryProjectionError } from "./work-memory-projection.js";

export async function handleWorkMemoryHandoffRequest(req, res, url, { service, json, readJson, authorize }) {
  const match = url.pathname.match(/^\/api\/work-items\/([^/]+)\/handoffs$/);
  if (!match) return false;
  if (!authorize(req)) {
    json(res, 401, { error: "control_token_required" });
    return true;
  }
  if (req.method !== "POST") {
    json(res, 405, { error: "method_not_allowed" });
    return true;
  }

  try {
    const body = await readJson(req);
    const created = await service.create(decodeURIComponent(match[1]), body);
    json(res, 201, created);
    return true;
  } catch (error) {
    if (error instanceof WorkMemoryHandoffError) {
      json(res, error.status, { error: error.code, message: error.message });
      return true;
    }
    if (error instanceof WorkMemoryProjectionError) {
      const status = error.code === "work_item_not_found" ? 404 : 409;
      json(res, status, { error: error.code, message: error.message });
      return true;
    }
    throw error;
  }
}
