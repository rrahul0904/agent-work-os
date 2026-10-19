import crypto from "node:crypto";

export const SESSION_SCHEMA = "agent-session/v1";
const AGENTS = new Set(["claude", "codex", "cursor", "opencode", "amp", "hermes", "generic"]);

function uid(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

function iso(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function clone(value) {
  return structuredClone(value);
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content == null ? "" : JSON.stringify(content);
  return content
    .filter((b) => b && ["text", "input_text", "output_text", "thinking"].includes(b.type))
    .map((b) => b.text ?? b.thinking ?? "")
    .filter(Boolean)
    .join("\n");
}

function normalizeRole(role) {
  if (["user", "assistant", "system", "tool"].includes(role)) return role;
  return "assistant";
}

function toolCallFromBlock(block, resultMap = new Map()) {
  const callId = block.id ?? block.call_id ?? uid("call");
  return {
    id: callId,
    name: block.name ?? block.tool_name ?? "unknown_tool",
    arguments: block.input ?? block.arguments ?? {},
    result: resultMap.get(callId) ?? block.result ?? null,
    status: resultMap.has(callId) || block.result != null ? "completed" : "recorded",
    originalType: block.type ?? "tool_call"
  };
}

function parseJsonl(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === "object" && input !== null) {
    if (Array.isArray(input.lines)) return input.lines;
    return [input];
  }
  return String(input ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        return { type: "text", role: "user", content: line, _line: index + 1 };
      }
    });
}

function emptyCanonical(sourceAgent = "generic", metadata = {}) {
  return {
    schema: SESSION_SCHEMA,
    id: uid("session"),
    parentSessionId: null,
    sourceAgent,
    currentAgent: sourceAgent,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "idle",
    project: {
      cwd: metadata.cwd ?? null,
      repo: metadata.repo ?? null,
      branch: metadata.branch ?? null
    },
    messages: [],
    metadata: {
      sourceSessionId: metadata.sourceSessionId ?? null,
      importedAt: new Date().toISOString(),
      ...metadata
    }
  };
}

function normalizeClaude(lines, metadata = {}) {
  const session = emptyCanonical("claude", metadata);
  const resultMap = new Map();

  for (const row of lines) {
    const rowType = row?.type;
    const msg = row?.message ?? row;
    const role = normalizeRole(msg?.role ?? (rowType === "user" ? "user" : rowType === "assistant" ? "assistant" : "assistant"));
    const content = msg?.content ?? row?.content ?? row?.text ?? "";
    const blocks = Array.isArray(content) ? content : [];
    for (const b of blocks) {
      if (b?.type === "tool_result") {
        resultMap.set(b.tool_use_id ?? b.call_id, b.content ?? b.result ?? null);
      }
    }
  }

  for (const row of lines) {
    if (row?.sessionId || row?.session_id) session.metadata.sourceSessionId ??= row.sessionId ?? row.session_id;
    if (row?.cwd) session.project.cwd ??= row.cwd;
    if (row?.type === "queue-operation" || row?.type === "progress") continue;

    const msg = row?.message ?? row;
    let role = msg?.role;
    if (!role && row?.type === "user") role = "user";
    if (!role && row?.type === "assistant") role = "assistant";
    if (!role && row?.type === "system") role = "system";
    if (!role && row?.type === "tool") role = "tool";
    if (!role && !msg?.content && !row?.content && !row?.text) continue;

    const content = msg?.content ?? row?.content ?? row?.text ?? "";
    const blocks = Array.isArray(content) ? content : [];
    const toolCalls = blocks
      .filter((b) => b?.type === "tool_use" || b?.type === "function_call" || b?.type === "tool_call")
      .map((b) => toolCallFromBlock(b, resultMap));

    const reasoning = blocks
      .filter((b) => b?.type === "thinking" || b?.type === "reasoning")
      .map((b) => b.thinking ?? b.text ?? "")
      .filter(Boolean)
      .join("\n");

    const visibleText = textFromContent(content);
    if (!visibleText && toolCalls.length === 0 && !reasoning) continue;

    session.messages.push({
      id: row?.uuid ?? row?.id ?? uid("msg"),
      parentId: row?.parentUuid ?? row?.parent_id ?? null,
      role: normalizeRole(role),
      content: visibleText,
      reasoning: reasoning || null,
      toolCalls,
      createdAt: iso(row?.timestamp ?? row?.created_at),
      metadata: {
        sourceType: row?.type ?? null,
        sourceAgent: "claude"
      }
    });
  }

  session.updatedAt = new Date().toISOString();
  return session;
}

function normalizeCodex(lines, metadata = {}) {
  const session = emptyCanonical("codex", metadata);
  const resultMap = new Map();

  for (const row of lines) {
    const item = row?.item ?? row?.payload ?? row;
    const type = item?.type ?? row?.type;
    if (["function_call_output", "tool_result", "tool_output"].includes(type)) {
      resultMap.set(item.call_id ?? item.id, item.output ?? item.result ?? item.content ?? null);
    }
  }

  for (const row of lines) {
    const item = row?.item ?? row?.payload ?? row;
    const type = item?.type ?? row?.type;
    if (row?.session_id || row?.sessionId || row?.thread_id) {
      session.metadata.sourceSessionId ??= row.session_id ?? row.sessionId ?? row.thread_id;
    }
    if (row?.cwd) session.project.cwd ??= row.cwd;

    if (["function_call_output", "tool_result", "tool_output"].includes(type)) continue;

    if (["function_call", "tool_call"].includes(type)) {
      const call = toolCallFromBlock(item, resultMap);
      session.messages.push({
        id: row?.id ?? uid("msg"),
        parentId: row?.parent_id ?? null,
        role: "assistant",
        content: "",
        reasoning: null,
        toolCalls: [call],
        createdAt: iso(row?.timestamp ?? row?.created_at),
        metadata: { sourceType: type, sourceAgent: "codex" }
      });
      continue;
    }

    const role = item?.role ?? row?.role;
    const content = item?.content ?? row?.content ?? row?.text ?? item?.text;
    const reasoning = type === "reasoning" ? textFromContent(content) : (item?.reasoning ?? null);
    if (!role && !content && !reasoning) continue;

    session.messages.push({
      id: row?.id ?? item?.id ?? uid("msg"),
      parentId: row?.parent_id ?? null,
      role: normalizeRole(role ?? (type === "reasoning" ? "assistant" : "assistant")),
      content: type === "reasoning" ? "" : textFromContent(content),
      reasoning: reasoning || null,
      toolCalls: Array.isArray(item?.tool_calls)
        ? item.tool_calls.map((c) => toolCallFromBlock(c, resultMap))
        : [],
      createdAt: iso(row?.timestamp ?? row?.created_at),
      metadata: { sourceType: type ?? null, sourceAgent: "codex" }
    });
  }

  session.updatedAt = new Date().toISOString();
  return session;
}

function normalizeGeneric(lines, sourceAgent = "generic", metadata = {}) {
  const session = emptyCanonical(sourceAgent, metadata);
  for (const row of lines) {
    if (row?.schema === SESSION_SCHEMA && Array.isArray(row?.messages)) return validateCanonical(row);
    const role = row?.role ?? row?.message?.role ?? "user";
    const content = row?.content ?? row?.message?.content ?? row?.text ?? "";
    session.messages.push({
      id: row?.id ?? uid("msg"),
      parentId: row?.parentId ?? row?.parent_id ?? null,
      role: normalizeRole(role),
      content: textFromContent(content),
      reasoning: row?.reasoning ?? null,
      toolCalls: Array.isArray(row?.toolCalls ?? row?.tool_calls)
        ? (row.toolCalls ?? row.tool_calls).map((c) => toolCallFromBlock(c))
        : [],
      createdAt: iso(row?.createdAt ?? row?.timestamp),
      metadata: { sourceAgent }
    });
  }
  return session;
}

export function validateCanonical(input) {
  if (!input || input.schema !== SESSION_SCHEMA || !Array.isArray(input.messages)) {
    throw new Error(`Expected ${SESSION_SCHEMA} canonical session`);
  }
  const session = clone(input);
  session.id ??= uid("session");
  session.sourceAgent ??= "generic";
  session.currentAgent ??= session.sourceAgent;
  session.createdAt ??= new Date().toISOString();
  session.updatedAt ??= session.createdAt;
  session.status ??= "idle";
  session.project ??= { cwd: null, repo: null, branch: null };
  session.metadata ??= {};
  session.messages = session.messages.map((m) => ({
    id: m.id ?? uid("msg"),
    parentId: m.parentId ?? null,
    role: normalizeRole(m.role),
    content: textFromContent(m.content),
    reasoning: m.reasoning ?? null,
    toolCalls: Array.isArray(m.toolCalls) ? m.toolCalls : [],
    createdAt: iso(m.createdAt),
    metadata: m.metadata ?? {}
  }));
  return session;
}

export function canonicalizeSession(input, sourceAgent = "generic", metadata = {}) {
  if (input?.schema === SESSION_SCHEMA) return validateCanonical(input);
  const source = AGENTS.has(sourceAgent) ? sourceAgent : "generic";
  const lines = parseJsonl(input);
  if (source === "claude") return normalizeClaude(lines, metadata);
  if (source === "codex") return normalizeCodex(lines, metadata);
  return normalizeGeneric(lines, source, metadata);
}

export function detectRateLimit(text) {
  const value = String(text ?? "");
  const patterns = [
    /limit\s+reached/i,
    /usage\s+limit/i,
    /rate\s*limit/i,
    /resets?\s+in\s+\d+/i,
    /too\s+many\s+requests/i,
    /quota\s+(?:exceeded|reached)/i
  ];
  const matched = patterns.find((p) => p.test(value));
  if (!matched) return { limited: false, reason: null, resetHint: null };
  const reset = value.match(/resets?\s+in\s+([^\n.]+)/i);
  return { limited: true, reason: matched.source, resetHint: reset?.[1]?.trim() ?? null };
}

export function assertHandoffSafe(session) {
  const canonical = validateCanonical(session);
  if (canonical.status === "running" || canonical.metadata?.midTurn === true) {
    const err = new Error("HANDOFF_BLOCKED_MID_TURN");
    err.code = "HANDOFF_BLOCKED_MID_TURN";
    throw err;
  }
  const incomplete = canonical.messages.flatMap((m) => m.toolCalls ?? []).filter((c) => c.status === "running");
  if (incomplete.length) {
    const err = new Error("HANDOFF_BLOCKED_OPEN_TOOL_CALL");
    err.code = "HANDOFF_BLOCKED_OPEN_TOOL_CALL";
    throw err;
  }
  return true;
}

export function sliceSession(session, fromMessageId) {
  const canonical = validateCanonical(session);
  if (!fromMessageId) return clone(canonical);
  const index = canonical.messages.findIndex((m) => m.id === fromMessageId);
  if (index < 0) throw new Error(`Unknown message id: ${fromMessageId}`);
  const sliced = clone(canonical);
  sliced.id = uid("session");
  sliced.parentSessionId = canonical.id;
  sliced.messages = canonical.messages.slice(index);
  sliced.metadata = {
    ...sliced.metadata,
    slicedFromSessionId: canonical.id,
    slicedFromMessageId: fromMessageId
  };
  sliced.updatedAt = new Date().toISOString();
  return sliced;
}

export function forkSession(session) {
  const canonical = validateCanonical(session);
  const fork = clone(canonical);
  fork.id = uid("session");
  fork.parentSessionId = canonical.id;
  fork.metadata = { ...fork.metadata, forkedFromSessionId: canonical.id };
  fork.updatedAt = new Date().toISOString();
  return fork;
}

function messageToClaudeRows(m) {
  const blocks = [];
  if (m.reasoning) blocks.push({ type: "thinking", thinking: m.reasoning });
  if (m.content) blocks.push({ type: "text", text: m.content });
  for (const call of m.toolCalls ?? []) {
    blocks.push({
      type: "tool_use",
      id: call.id,
      name: call.name,
      input: call.arguments ?? {}
    });
    if (call.result != null) {
      blocks.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: typeof call.result === "string" ? call.result : JSON.stringify(call.result)
      });
    }
  }
  return {
    type: m.role === "user" ? "user" : m.role === "system" ? "system" : "assistant",
    uuid: m.id,
    parentUuid: m.parentId ?? null,
    timestamp: m.createdAt,
    message: { role: m.role, content: blocks.length ? blocks : m.content }
  };
}

function messageToCodexRows(m) {
  const rows = [];
  if (m.reasoning) {
    rows.push({
      type: "response_item",
      id: uid("ri"),
      item: { type: "reasoning", role: "assistant", content: m.reasoning }
    });
  }
  if (m.content) {
    rows.push({
      type: "response_item",
      id: m.id,
      item: { type: "message", role: m.role, content: [{ type: "input_text", text: m.content }] }
    });
  }
  for (const call of m.toolCalls ?? []) {
    rows.push({
      type: "response_item",
      id: uid("ri"),
      item: {
        type: "function_call",
        call_id: call.id,
        name: call.name,
        arguments: typeof call.arguments === "string" ? call.arguments : JSON.stringify(call.arguments ?? {})
      }
    });
    if (call.result != null) {
      rows.push({
        type: "response_item",
        id: uid("ri"),
        item: {
          type: "function_call_output",
          call_id: call.id,
          output: typeof call.result === "string" ? call.result : JSON.stringify(call.result)
        }
      });
    }
  }
  return rows;
}

export function serializeForAgent(session, targetAgent = "generic") {
  const canonical = validateCanonical(session);
  if (targetAgent === "claude") {
    return canonical.messages.map(messageToClaudeRows).map((x) => JSON.stringify(x)).join("\n");
  }
  if (targetAgent === "codex") {
    return canonical.messages.flatMap(messageToCodexRows).map((x) => JSON.stringify(x)).join("\n");
  }
  return JSON.stringify(canonical, null, 2);
}

export function handoffSession(input, {
  sourceAgent = "generic",
  targetAgent = "codex",
  fromMessageId = null,
  fork = false,
  metadata = {}
} = {}) {
  let canonical = canonicalizeSession(input, sourceAgent, metadata);
  assertHandoffSafe(canonical);
  if (fromMessageId) canonical = sliceSession(canonical, fromMessageId);
  if (fork) canonical = forkSession(canonical);
  canonical.currentAgent = targetAgent;
  canonical.metadata = {
    ...canonical.metadata,
    handedOffAt: new Date().toISOString(),
    handedOffFrom: sourceAgent,
    handedOffTo: targetAgent
  };
  canonical.updatedAt = new Date().toISOString();
  return {
    canonical,
    targetAgent,
    serialized: serializeForAgent(canonical, targetAgent)
  };
}

export function exportSessionBundle(session) {
  const canonical = validateCanonical(session);
  return JSON.stringify({
    format: "agent-work-os-session-bundle/v1",
    exportedAt: new Date().toISOString(),
    session: canonical
  }, null, 2);
}

export function importSessionBundle(text) {
  const parsed = typeof text === "string" ? JSON.parse(text) : text;
  if (parsed?.format === "agent-work-os-session-bundle/v1") return validateCanonical(parsed.session);
  return canonicalizeSession(parsed, "generic");
}
