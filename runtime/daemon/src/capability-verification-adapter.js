import path from "node:path";
import { verifyCapabilityWithAdapter } from "./capability-verifier.js";
import { verifyCodexNativeDiscovery } from "./codex-native-verifier.js";
import { verifyClaudeNativeDiscovery } from "./claude-native-verifier.js";
import { verifyOpenCodeNativeDiscovery } from "./opencode-native-verifier.js";
import { verifyCursorNativeDiscovery } from "./cursor-native-verifier.js";

export class CapabilityVerificationAdapter {
  name = "capability-verify";
  #adapters = new Map();
  #active = new Map();

  constructor(codexAdapter = null, claudeCodeAdapter = null, openCodeAdapter = null, cursorAdapter = null) {
    if (codexAdapter) this.#adapters.set("codex", codexAdapter);
    if (claudeCodeAdapter) this.#adapters.set("claude-code", claudeCodeAdapter);
    if (openCodeAdapter) this.#adapters.set("opencode", openCodeAdapter);
    if (cursorAdapter) this.#adapters.set("cursor", cursorAdapter);
  }

  capability() {
    const available = [...this.#adapters.entries()]
      .map(([harnessId, adapter]) => ({ harnessId, capability: adapter?.capability?.() }))
      .filter((entry) => entry.capability);
    if (!available.length) return null;
    const harnessModes = Object.fromEntries(available.map(({ harnessId }) => [harnessId, ["artifact-context", "native-discovery"]]));
    return {
      name: this.name,
      executable: "builtin",
      version: "6",
      harnesses: available.map((entry) => entry.harnessId),
      modes: [...new Set(Object.values(harnessModes).flat())],
      harnessModes,
      nestedHarnesses: available.map(({ harnessId, capability }) => ({
        harnessId,
        name: capability.name,
        version: capability.version ?? null
      }))
    };
  }

  async run(request, emit) {
    const capability = this.capability();
    if (!capability) throw new Error("No supported harness CLI is available for capability verification");
    const payload = parsePayload(request.prompt);
    if (payload.approveWrite !== true) throw new Error("capability verification requires approveWrite=true");
    const harnessId = payload.harnessId ?? "codex";
    const nestedAdapter = this.#adapters.get(harnessId);
    if (!nestedAdapter?.capability?.()) throw new Error(`harness ${harnessId} is unavailable for capability verification`);
    const mode = payload.mode ?? "artifact-context";
    const allowedModes = capability.harnessModes[harnessId] ?? [];
    if (!allowedModes.includes(mode)) throw new Error(`unsupported capability verification mode ${mode} for harness ${harnessId}`);
    const workspace = path.resolve(request.cwd);
    const nestedSessions = new Set();
    let sequence = 0;
    this.#active.set(request.sessionId, { adapter: nestedAdapter, nestedSessions });
    const sessionIdFactory = () => {
      const id = `${request.sessionId}:capability:${++sequence}`;
      nestedSessions.add(id);
      return id;
    };

    emit({ kind: "status", status: "running", message: `Capability verification (${harnessId}/${mode}) started`, at: new Date().toISOString() });
    try {
      let result;
      if (mode === "artifact-context") {
        const targetRoot = path.resolve(payload.targetRoot ?? workspace);
        assertWithinWorkspace(workspace, targetRoot);
        result = await verifyCapabilityWithAdapter({
          spec: payload.spec,
          harnessId,
          adapter: nestedAdapter,
          cwd: workspace,
          targetRoot,
          approveWrite: true,
          allowDegraded: payload.allowDegraded === true,
          retainInstallation: false,
          receiptPath: null,
          sessionIdFactory
        });
      } else if (mode === "native-discovery") {
        if (payload.workspaceRoot && path.resolve(payload.workspaceRoot) !== workspace) {
          throw new Error("native-discovery workspaceRoot must match the session cwd");
        }
        if (harnessId === "codex") {
          result = await verifyCodexNativeDiscovery({ spec: payload.spec, adapter: nestedAdapter, workspaceRoot: workspace, approveWrite: true, receiptPath: null, sessionIdFactory });
        } else if (harnessId === "claude-code") {
          result = await verifyClaudeNativeDiscovery({ spec: payload.spec, adapter: nestedAdapter, workspaceRoot: workspace, approveWrite: true, receiptPath: null, sessionIdFactory });
        } else if (harnessId === "opencode") {
          result = await verifyOpenCodeNativeDiscovery({ spec: payload.spec, adapter: nestedAdapter, workspaceRoot: workspace, approveWrite: true, receiptPath: null, sessionIdFactory });
        } else if (harnessId === "cursor") {
          result = await verifyCursorNativeDiscovery({ spec: payload.spec, adapter: nestedAdapter, workspaceRoot: workspace, approveWrite: true, receiptPath: null, sessionIdFactory });
        } else {
          throw new Error(`unsupported capability verification mode ${mode} for harness ${harnessId}`);
        }
      } else {
        throw new Error(`unsupported capability verification mode ${mode} for harness ${harnessId}`);
      }

      emit({ kind: "tool", name: "capability.verification.receipt", phase: "completed", payload: result.receipt, at: new Date().toISOString() });
      emit({
        kind: "text",
        text: JSON.stringify({
          capabilityId: result.receipt.capabilityId,
          harnessId: result.receipt.harnessId,
          verificationMode: result.receipt.verificationMode,
          passed: result.receipt.passed,
          score: result.receipt.score,
          qualityThreshold: result.receipt.qualityThreshold,
          receiptDigest: result.receipt.receiptDigest
        }),
        at: new Date().toISOString()
      });
      emit({
        kind: "status",
        status: result.receipt.passed ? "completed" : "failed",
        message: result.receipt.passed ? "Capability verification passed" : "Capability verification failed",
        at: new Date().toISOString()
      });
      return {};
    } finally {
      this.#active.delete(request.sessionId);
    }
  }

  async interrupt(sessionId) {
    const active = this.#active.get(sessionId);
    if (!active) return;
    await Promise.all([...active.nestedSessions].map((id) => active.adapter.interrupt(id)));
  }
}

function parsePayload(raw) {
  let payload;
  try { payload = JSON.parse(raw); }
  catch { throw new Error("capability verification prompt must be a JSON payload"); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !payload.spec) throw new Error("capability verification payload requires spec");
  return payload;
}
function assertWithinWorkspace(workspace, target) {
  if (target === workspace) return;
  if (!target.startsWith(`${workspace}${path.sep}`)) throw new Error("capability verification targetRoot must stay inside the session cwd");
}
