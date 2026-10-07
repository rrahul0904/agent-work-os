import { WorkMemoryProjectionError } from "./work-memory-projection.js";

export function handleWorkMemoryRequest(req, res, url, { service, json, authorize }) {
  const match = url.pathname.match(/^\/api\/work-items\/([^/]+)\/work-memory$/);
  if (!match) return false;
  if (!authorize(req)) {
    json(res, 401, { error: "control_token_required" });
    return true;
  }
  if (req.method !== "GET") {
    json(res, 405, { error: "work_memory_read_only" });
    return true;
  }
  try {
    const workItemId = decodeURIComponent(match[1]);
    json(res, 200, service.getProjection(workItemId));
    return true;
  } catch (error) {
    if (error instanceof WorkMemoryProjectionError) {
      const status = error.code === "work_item_not_found" ? 404 : 409;
      json(res, status, { error: error.code, message: error.message });
      return true;
    }
    throw error;
  }
}
