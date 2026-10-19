import {
  canonicalizeSession,
  handoffSession,
  forkSession,
  sliceSession,
  exportSessionBundle,
  importSessionBundle,
  detectRateLimit,
  serializeForAgent
} from "../lib/session-fabric.js";

function json(res, status, body) {
  res.status(status).setHeader("cache-control", "no-store").setHeader("content-type", "application/json; charset=utf-8").send(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST required" });
  try {
    const body = req.body ?? {};
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > 1_500_000) return json(res, 413, {error: "Request exceeds the 1.5 MB processing limit"});
    const action = body.action ?? "handoff";
    if (action === "detect-limit") return json(res, 200, detectRateLimit(body.text));
    if (action === "import") return json(res, 200, { session: importSessionBundle(body.bundle) });

    const session = canonicalizeSession(body.session ?? body.input ?? "", body.sourceAgent ?? "generic", body.metadata ?? {});
    if (action === "canonicalize") return json(res, 200, { session });
    if (action === "fork") return json(res, 200, { session: forkSession(session) });
    if (action === "slice") return json(res, 200, { session: sliceSession(session, body.fromMessageId) });
    if (action === "export") return json(res, 200, { bundle: exportSessionBundle(session) });
    if (action === "serialize") return json(res, 200, { serialized: serializeForAgent(session, body.targetAgent ?? "generic") });
    if (action === "handoff") {
      return json(res, 200, handoffSession(session, {
        sourceAgent: body.sourceAgent ?? session.currentAgent ?? "generic",
        targetAgent: body.targetAgent ?? "codex",
        fromMessageId: body.fromMessageId ?? null,
        fork: Boolean(body.fork),
        metadata: body.metadata ?? {}
      }));
    }
    return json(res, 400, { error: `Unknown action: ${action}` });
  } catch (error) {
    return json(res, error.code?.startsWith("HANDOFF_BLOCKED") ? 409 : 400, {
      error: error.message,
      code: error.code ?? null
    });
  }
}
