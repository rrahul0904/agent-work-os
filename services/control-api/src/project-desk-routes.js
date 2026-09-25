import { ProjectDeskError } from "./project-desk.js";

export async function handleProjectDeskRequest(req, res, url, { desk, json, readJson }) {
  try {
    if (req.method === "GET" && url.pathname === "/api/work-items") {
      json(res, 200, { workItems: desk.listWorkItems() }); return true;
    }
    if (req.method === "GET" && url.pathname === "/api/decisions") {
      json(res, 200, { decisions: desk.listDecisions() }); return true;
    }
    if (req.method === "GET" && url.pathname === "/api/activity") {
      json(res, 200, { activity: desk.listActivity() }); return true;
    }
    if (req.method === "POST" && url.pathname === "/api/work-items") {
      json(res, 201, await desk.createWorkItem(await readJson(req))); return true;
    }

    const claim = url.pathname.match(/^\/api\/work-items\/([^/]+)\/claim$/);
    if (req.method === "POST" && claim) {
      const body = await readJson(req);
      json(res, 200, await desk.claimWorkItem(decodeURIComponent(claim[1]), body.actor)); return true;
    }

    const move = url.pathname.match(/^\/api\/work-items\/([^/]+)\/move$/);
    if (req.method === "POST" && move) {
      const body = await readJson(req);
      json(res, 200, await desk.moveWorkItem(decodeURIComponent(move[1]), body.lane, body.actor)); return true;
    }

    const report = url.pathname.match(/^\/api\/work-items\/([^/]+)\/completion-report$/);
    if (req.method === "POST" && report) {
      const body = await readJson(req);
      json(res, 200, await desk.submitCompletionReport(decodeURIComponent(report[1]), body.report, body.actor)); return true;
    }

    const decision = url.pathname.match(/^\/api\/work-items\/([^/]+)\/decision-requests$/);
    if (req.method === "POST" && decision) {
      const body = await readJson(req);
      json(res, 201, await desk.requestDecision(decodeURIComponent(decision[1]), body, body.actor)); return true;
    }

    const resolve = url.pathname.match(/^\/api\/decisions\/([^/]+)\/resolve$/);
    if (req.method === "POST" && resolve) {
      const body = await readJson(req);
      json(res, 200, await desk.resolveDecision(decodeURIComponent(resolve[1]), body, body.actor)); return true;
    }

    const complete = url.pathname.match(/^\/api\/work-items\/([^/]+)\/complete$/);
    if (req.method === "POST" && complete) {
      const body = await readJson(req);
      json(res, 200, await desk.completeWorkItem(decodeURIComponent(complete[1]), body.actor)); return true;
    }

    return false;
  } catch (error) {
    if (error instanceof ProjectDeskError) {
      json(res, error.status, { error: error.code, message: error.message }); return true;
    }
    throw error;
  }
}
