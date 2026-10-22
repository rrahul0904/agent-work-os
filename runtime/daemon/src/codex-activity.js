// Evidence-only projection of Codex CLI `codex exec --json` events.
// Do not persist raw command arguments, prompts, diff text, tool output,
// environment, or Codex-auth material into the control plane.
const ITEM_TYPES = new Set([
  "command_execution", "file_change", "mcp_tool_call", "collab_tool_call",
  "web_search", "todo_list", "agent_message", "reasoning", "error"
]);
const LIFECYCLES = new Set(["item.started", "item.updated", "item.completed"]);
const TOOL_PHASES = new Map([
  ["item.started", "started"], ["item.updated", "updated"], ["item.completed", "completed"]
]);
const SAFE_STATUS = new Set(["pending", "in_progress", "inProgress", "running", "completed", "failed", "interrupted",
  "errored", "shutdown", "notFound", "not_found", "pendingInit", "pending_init"]);

function safeId(value) {
  return typeof value === "string" && /^[\w.:-]{1,160}$/.test(value) ? value : null;
}
function safeStatus(value, fallback) {
  return SAFE_STATUS.has(value) ? value : fallback;
}
function safeAgentStates(states, ids) {
  const values = [];
  if (!states || typeof states !== "object" || Array.isArray(states)) return values;
  for (const id of ids) {
    const state = states[id];
    if (state && typeof state === "object") values.push({ threadId: id, status: safeStatus(state.status, "unknown") });
  }
  return values;
}
function boundedIds(value) {
  return Array.isArray(value) ? [...new Set(value.map(safeId).filter(Boolean))].slice(0, 12) : [];
}
/** Returns at most one safe semantic event per source JSONL event. */
export function projectCodexExecEvent(source, at = new Date().toISOString()) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  if (!LIFECYCLES.has(source.type)) return null;
  const item = source.item;
  if (!item || typeof item !== "object" || Array.isArray(item) || !ITEM_TYPES.has(item.type)) return null;
  const itemId = safeId(item.id);
  if (!itemId) return null;
  const status = safeStatus(item.status,
    source.type === "item.completed" ? "completed" : "running");
  const event = {
    kind: "codex.activity",
    source: "codex-exec-json/v1",
    itemId,
    itemType: item.type,
    phase: TOOL_PHASES.get(source.type),
    status,
    at
  };
  if (item.type === "command_execution") {
    // Exit code only: command strings and stdout may contain secrets.
    if (Number.isSafeInteger(item.exit_code)) event.exitCode = item.exit_code;
    if (event.phase === "completed" && event.exitCode !== undefined && event.exitCode !== 0) event.status = "failed";
  } else if (item.type === "collab_tool_call") {
    const tool = safeId(item.tool);
    if (tool) event.tool = tool;
    const sender = safeId(item.sender_thread_id);
    if (sender) event.senderThreadId = sender;
    event.receiverThreadIds = boundedIds(item.receiver_thread_ids);
    event.agentStates = safeAgentStates(item.agents_states, event.receiverThreadIds);
  } else if (item.type === "file_change") {
    if (item.changes && typeof item.changes === "object" && !Array.isArray(item.changes)) {
      event.changedFileCount = Math.min(10000, Object.keys(item.changes).length);
    }
  } else if (item.type === "todo_list") {
    // Preserve the count, not arbitrary plan text, which may contain secrets.
    if (Array.isArray(item.items)) event.planStepCount = Math.min(200, item.items.length);
  }
  if (item.type === "error" || (event.phase === "completed" && ["failed", "errored", "interrupted"].includes(event.status))) event.status = "failed";
  return event;
}

export function codexExecArgs(request, { model = null, extra = [] } = {}) {
  const sandbox = request.sandbox ?? "workspace-write";
  if (!["read-only", "workspace-write"].includes(sandbox)) throw new Error("forge_codex_sandbox_invalid");
  if (sandbox === "read-only" && extra.length) throw new Error("forge_codex_readonly_extra_args_refused");
  const args = ["exec", "--json", "--sandbox", sandbox, "--cd", request.cwd];
  if (model) args.push("--model", model);
  if (!Array.isArray(extra) || extra.some(x => typeof x !== "string")) throw new Error("invalid_codex_args");
  // Extras can increase privileges, so this function does not interpret them:
  // the daemon's deployment policy controls which operator can configure them.
  args.push(...extra);
  if (request.nativeSessionId) args.push("resume", request.nativeSessionId, request.prompt);
  else args.push(request.prompt);
  return args;
}
