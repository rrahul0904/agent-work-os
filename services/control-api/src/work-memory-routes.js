import { WorkMemoryProjectionError } from "./work-memory-projection.js";

export function handleWorkMemoryRequest(req, res, url, { service, json }) {
  const match = url.pathname.match(/^\/api\/work-items\/([^/]+)\/work-memory$/);
  if (req.method !== "GET" || !match) return false;
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
