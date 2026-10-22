// Opt-in REA Forge observer for project-local Codex hooks.
// Hooks must be reviewed/trusted in Codex. Sends metadata ONLY to loopback.
// Transport failures are advisory and must never deny/approve tool execution.
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const ALLOWED = new Set([
  "SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse",
  "SubagentStart", "SubagentStop", "Stop", "Interrupt"
]);
const simpleId = value => typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value) ? value : undefined;
const safeKind = value => typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value) ? value : undefined;

function projectHook(raw) {
  if (!raw || typeof raw !== "object" || !ALLOWED.has(raw.hook_event_name)) return null;
  const sessionId = simpleId(raw.session_id);
  if (!sessionId) return null;
  return {
    eventId: randomUUID(),
    sessionId,
    eventName: raw.hook_event_name,
    turnId: simpleId(raw.turn_id),
    agentId: simpleId(raw.agent_id),
    agentType: safeKind(raw.agent_type),
    toolUseId: simpleId(raw.tool_use_id),
    toolName: safeKind(raw.tool_name)
  };
}
export { projectHook };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let text = "";
  try {
    for await (const chunk of process.stdin) {
      text += chunk.toString("utf8");
      if (text.length > 100_000) throw new Error("hook_input_too_large");
    }
    const raw = JSON.parse(text);
    const projected = projectHook(raw);
    if (projected) {
      const port = Number(process.env.AGENT_WORK_OS_PORT ?? "8787");
      if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("forge_port_invalid");
      const target = "http://127.0.0.1:" + port + "/api/forge/observations";
      // Development-token compatibility. Never send credentials anywhere other
      // than literal loopback; production API rejects observations.
      const token = process.env.AGENT_WORK_OS_TOKEN || "dev-token";
      await fetch(target, {
        method: "POST",
        headers: { authorization: "Bearer " + token, "content-type": "application/json" },
        body: JSON.stringify(projected),
        signal: AbortSignal.timeout(1000)
      });
    }
  } catch {
    // Observer must never influence Codex's policies, tool approvals or output.
  }
  // These two Codex hook events expect JSON rather than plain text on stdout.
  try {
    const parsed = JSON.parse(text);
    if (parsed?.hook_event_name === "SubagentStop" || parsed?.hook_event_name === "Stop") process.stdout.write("{}\n");
  } catch {}
}
