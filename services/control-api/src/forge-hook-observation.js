// Codex lifecycle hooks are observer signals only, never execution receipts.
const VALID = new Set(["SessionStart", "SessionEnd", "UserPromptSubmit",
  "PreToolUse", "PostToolUse", "SubagentStart", "SubagentStop",
  "Stop", "Interrupt"]);
function id(x) { return typeof x === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(x) ? x : null; }
function kind(x) { return typeof x === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(x) ? x : null; }

/** Strict allowlist and no raw prompts, transcripts, tool args or results. */
export function sanitizeForgeHook(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("forge_hook_invalid");
  if (!VALID.has(input.eventName) || !id(input.sessionId)) throw new Error("forge_hook_identity_invalid");
  const out = {
    source: "codex-hook/v1",
    sessionId: id(input.sessionId),
    eventName: input.eventName,
    turnId: id(input.turnId),
    agentId: id(input.agentId),
    agentType: kind(input.agentType),
    toolUseId: id(input.toolUseId),
    toolName: kind(input.toolName)
  };
  // Minimize identifying metadata: no cwd, transcript path, model or prompt.
  return Object.fromEntries(Object.entries(out).filter(([, value]) => value != null));
}
export function nativeHookState(eventName) {
  if (eventName === "SessionStart" || eventName === "UserPromptSubmit") return "running";
  if (eventName === "Stop") return "turn-ended";
  if (eventName === "SessionEnd") return "ended";
  if (eventName === "Interrupt") return "interrupted";
  return null;
}
