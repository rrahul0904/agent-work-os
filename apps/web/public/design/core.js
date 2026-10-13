const VERSION = "collab-design-document/v1";

export function createDocument({ id = "design-1", name = "Untitled", actorId = "local" } = {}) {
  return {
    version: VERSION,
    id,
    name,
    nodes: [],
    selection: [],
    history: { past: [], future: [] },
    collaboration: { actorId, sequence: 0, operations: [] },
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

export function clone(value) {
  return structuredClone(value);
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function stableDigest(value) {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function makeNode(type, props = {}) {
  const defaults = {
    rect: { name: "Rectangle", x: 120, y: 120, width: 180, height: 120, fill: "#7c3aed", radius: 14 },
    frame: { name: "Frame", x: 90, y: 90, width: 520, height: 340, fill: "#ffffff", radius: 18, layout: "free", gap: 16, padding: 24 },
    text: { name: "Text", x: 140, y: 140, width: 240, height: 54, fill: "transparent", text: "Double-click to edit", color: "#111827", fontSize: 24 },
    sticky: { name: "Sticky", x: 160, y: 160, width: 190, height: 150, fill: "#fde68a", text: "Idea", color: "#78350f", fontSize: 20 },
    connector: { name: "Connector", x: 0, y: 0, width: 0, height: 0, from: null, to: null, fill: "#64748b" }
  };
  if (!defaults[type]) throw new Error(`unsupported node type: ${type}`);
  return { id: props.id ?? makeId(type), type, parentId: props.parentId ?? null, locked: false, hidden: false, ...defaults[type], ...props };
}

export function applyCommand(document, command, { actorId = document.collaboration.actorId, recordHistory = true } = {}) {
  validateCommand(command);
  const before = snapshotState(document);
  const inverse = makeInverseCommand(document, command);
  const next = clone(document);
  mutate(next, command);
  normalizeSelection(next);
  const after = snapshotState(next);
  const sequence = next.collaboration.sequence + 1;
  const operation = {
    version: "collab-design-operation/v1",
    operationId: command.operationId ?? `${actorId}:${sequence}`,
    actorId,
    sequence,
    command: clone(command),
    beforeDigest: stableDigest(before),
    afterDigest: stableDigest(after)
  };
  next.collaboration.sequence = sequence;
  next.collaboration.operations.push(operation);
  if (recordHistory) {
    next.history.past.push({ actorId, command: clone(command), inverse: clone(inverse), before, after, operationId: operation.operationId });
    next.history.future = [];
  }
  return next;
}

export function undo(document, actorId = document.collaboration.actorId) {
  const next = clone(document);
  for (let i = next.history.past.length - 1; i >= 0; i -= 1) {
    const entry = next.history.past[i];
    if (entry.actorId !== actorId) continue;
    next.history.past.splice(i, 1);
    mutate(next, entry.inverse);
    normalizeSelection(next);
    next.history.future.push(entry);
    next.collaboration.sequence += 1;
    next.collaboration.operations.push({
      version: "collab-design-operation/v1",
      operationId: `${actorId}:${next.collaboration.sequence}`,
      actorId,
      sequence: next.collaboration.sequence,
      command: { type: "history.undo", targetOperationId: entry.operationId },
      afterDigest: stableDigest(snapshotState(next))
    });
    return next;
  }
  return next;
}

export function redo(document, actorId = document.collaboration.actorId) {
  const next = clone(document);
  for (let i = next.history.future.length - 1; i >= 0; i -= 1) {
    const entry = next.history.future[i];
    if (entry.actorId !== actorId) continue;
    next.history.future.splice(i, 1);
    mutate(next, entry.command);
    normalizeSelection(next);
    next.history.past.push(entry);
    next.collaboration.sequence += 1;
    next.collaboration.operations.push({
      version: "collab-design-operation/v1",
      operationId: `${actorId}:${next.collaboration.sequence}`,
      actorId,
      sequence: next.collaboration.sequence,
      command: { type: "history.redo", targetOperationId: entry.operationId },
      afterDigest: stableDigest(snapshotState(next))
    });
    return next;
  }
  return next;
}

export function mergeRemoteOperation(document, operation) {
  if (!operation?.operationId || !operation?.actorId || !operation?.command) throw new Error("invalid remote operation");
  if (document.collaboration.operations.some((item) => item.operationId === operation.operationId)) return clone(document);
  return applyCommand(document, operation.command, { actorId: operation.actorId, recordHistory: true });
}

export function applyAutoLayout(document, frameId) {
  const frame = document.nodes.find((node) => node.id === frameId && node.type === "frame");
  if (!frame || frame.layout === "free") return clone(document);
  const children = document.nodes.filter((node) => node.parentId === frameId && node.type !== "connector");
  let cursor = frame.padding ?? 24;
  let maxCross = 0;
  const commands = [];
  for (const child of children) {
    const patch = frame.layout === "horizontal"
      ? { x: frame.x + cursor, y: frame.y + (frame.padding ?? 24) }
      : { x: frame.x + (frame.padding ?? 24), y: frame.y + cursor };
    commands.push({ type: "node.update", id: child.id, patch });
    cursor += (frame.layout === "horizontal" ? child.width : child.height) + (frame.gap ?? 16);
    maxCross = Math.max(maxCross, frame.layout === "horizontal" ? child.height : child.width);
  }
  let next = clone(document);
  for (const command of commands) next = applyCommand(next, command);
  const padding = frame.padding ?? 24;
  const primary = Math.max(0, cursor - (frame.gap ?? 16)) + padding;
  const sizePatch = frame.layout === "horizontal"
    ? { width: Math.max(frame.width, primary), height: Math.max(frame.height, maxCross + padding * 2) }
    : { height: Math.max(frame.height, primary), width: Math.max(frame.width, maxCross + padding * 2) };
  return applyCommand(next, { type: "node.update", id: frameId, patch: sizePatch });
}

export function exportDocument(document) {
  const clean = clone(document);
  clean.history = { past: [], future: [] };
  return stableStringify(clean);
}

export function importDocument(text) {
  const parsed = JSON.parse(text);
  if (parsed.version !== VERSION || !Array.isArray(parsed.nodes)) throw new Error("unsupported design document");
  parsed.history ??= { past: [], future: [] };
  parsed.collaboration ??= { actorId: "local", sequence: 0, operations: [] };
  parsed.selection ??= [];
  parsed.viewport ??= { x: 0, y: 0, zoom: 1 };
  return parsed;
}

export function documentReceipt(document) {
  const state = snapshotState(document);
  return {
    version: "collab-design-receipt/v1",
    documentId: document.id,
    documentDigest: stableDigest(state),
    nodeCount: document.nodes.length,
    operationCount: document.collaboration.operations.length,
    selected: [...document.selection]
  };
}

function mutate(document, command) {
  switch (command.type) {
    case "node.add": {
      const node = makeNode(command.node.type, command.node);
      if (document.nodes.some((item) => item.id === node.id)) throw new Error(`duplicate node id: ${node.id}`);
      document.nodes.push(node);
      document.selection = [node.id];
      return;
    }
    case "node.update": {
      const node = document.nodes.find((item) => item.id === command.id);
      if (!node) throw new Error(`node not found: ${command.id}`);
      if (node.locked && !command.patch.locked) throw new Error(`node is locked: ${command.id}`);
      Object.assign(node, sanitizePatch(command.patch));
      return;
    }
    case "node.delete": {
      const ids = new Set(command.ids ?? [command.id]);
      document.nodes = document.nodes.filter((item) => !ids.has(item.id) && !ids.has(item.parentId));
      document.nodes = document.nodes.filter((item) => item.type !== "connector" || (!ids.has(item.from) && !ids.has(item.to)));
      document.selection = document.selection.filter((id) => !ids.has(id));
      return;
    }
    case "node.restore": {
      const known = new Set(document.nodes.map((item) => item.id));
      for (const node of command.nodes ?? []) if (!known.has(node.id)) document.nodes.push(clone(node));
      document.selection = [...(command.selection ?? document.selection)];
      return;
    }
    case "selection.set":
      document.selection = [...new Set(command.ids ?? [])];
      return;
    case "node.reorder": {
      const index = document.nodes.findIndex((item) => item.id === command.id);
      if (index < 0) throw new Error(`node not found: ${command.id}`);
      const [node] = document.nodes.splice(index, 1);
      const target = Math.max(0, Math.min(document.nodes.length, command.index));
      document.nodes.splice(target, 0, node);
      return;
    }
    case "viewport.set":
      document.viewport = { ...document.viewport, ...command.patch };
      return;
    case "document.rename":
      document.name = String(command.name || "Untitled").slice(0, 120);
      return;
    default:
      throw new Error(`unsupported command: ${command.type}`);
  }
}

function makeInverseCommand(document, command) {
  switch (command.type) {
    case "node.add":
      return { type: "node.delete", id: command.node.id };
    case "node.update": {
      const node = document.nodes.find((item) => item.id === command.id);
      if (!node) throw new Error(`node not found: ${command.id}`);
      const patch = Object.fromEntries(Object.keys(sanitizePatch(command.patch)).map((key) => [key, clone(node[key])]));
      return { type: "node.update", id: command.id, patch };
    }
    case "node.delete": {
      const ids = new Set(command.ids ?? [command.id]);
      const removed = document.nodes.filter((item) => ids.has(item.id) || ids.has(item.parentId) || (item.type === "connector" && (ids.has(item.from) || ids.has(item.to))));
      return { type: "node.restore", nodes: clone(removed), selection: [...document.selection] };
    }
    case "selection.set":
      return { type: "selection.set", ids: [...document.selection] };
    case "node.reorder": {
      const index = document.nodes.findIndex((item) => item.id === command.id);
      if (index < 0) throw new Error(`node not found: ${command.id}`);
      return { type: "node.reorder", id: command.id, index };
    }
    case "viewport.set":
      return { type: "viewport.set", patch: Object.fromEntries(Object.keys(command.patch ?? {}).map((key) => [key, document.viewport[key]])) };
    case "document.rename":
      return { type: "document.rename", name: document.name };
    default:
      throw new Error(`unsupported command: ${command.type}`);
  }
}

function sanitizePatch(patch = {}) {
  const forbidden = new Set(["id", "type"]);
  return Object.fromEntries(Object.entries(patch).filter(([key]) => !forbidden.has(key)));
}

function validateCommand(command) {
  if (!command || typeof command !== "object" || !command.type) throw new Error("command.type is required");
}

function normalizeSelection(document) {
  const ids = new Set(document.nodes.map((node) => node.id));
  document.selection = document.selection.filter((id) => ids.has(id));
}

function snapshotState(document) {
  return { id: document.id, name: document.name, nodes: clone(document.nodes), selection: [...document.selection], viewport: clone(document.viewport) };
}

function restoreState(document, snapshot) {
  document.id = snapshot.id;
  document.name = snapshot.name;
  document.nodes = clone(snapshot.nodes);
  document.selection = [...snapshot.selection];
  document.viewport = clone(snapshot.viewport);
}

let idSequence = 0;
function makeId(prefix) {
  idSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSequence.toString(36)}`;
}
