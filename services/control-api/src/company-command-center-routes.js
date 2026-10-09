import { CompanyCommandCenterError } from "./company-command-center.js";

export async function handleCompanyCommandCenterRequest(req, res, url, { service, json, readJson, authorize }) {
  if (!url.pathname.startsWith("/api/company/")) return false;
  if (!authorize(req)) {
    json(res, 401, { error: "control_token_required" });
    return true;
  }
  try {
    if (req.method === "GET" && url.pathname === "/api/company/overview") {
      json(res, 200, service.getOverview()); return true;
    }
    if (req.method === "GET" && url.pathname === "/api/company/structure") {
      json(res, 200, service.getStructure()); return true;
    }
    if (req.method === "POST" && url.pathname === "/api/company/structure") {
      const body = await readJson(req);
      json(res, 200, await service.configureStructure(body.organization ?? body, body.actor)); return true;
    }
    if (req.method === "GET" && url.pathname === "/api/company/decision-desk") {
      json(res, 200, { decisions: service.getDecisionDesk() }); return true;
    }
    if (req.method === "GET" && url.pathname === "/api/company/audit-export") {
      json(res, 200, service.exportAudit()); return true;
    }
    return false;
  } catch (error) {
    if (error instanceof CompanyCommandCenterError) {
      json(res, error.status, { error: error.code, message: error.message }); return true;
    }
    throw error;
  }
}
