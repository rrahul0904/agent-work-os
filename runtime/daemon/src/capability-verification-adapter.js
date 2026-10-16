import path from "node:path";
import { verifyCapabilityWithAdapter } from "./capability-verifier.js";
import { verifyCodexNativeDiscovery } from "./codex-native-verifier.js";

export class CapabilityVerificationAdapter {
  name = "capability-verify";
  #codex;
  #active = new Map();

  constructor(codexAdapter) {
    this.#codex = codexAdapter;
  }

  capability() {
    const codex = this.#codex?.capability?.();
    if (!codex) return null;
    return {
      name: this.name,
      executable: "builtin",
      version: "1",
      harnesses: ["codex"],
      modes: ["artifact-context", "native-discovery"],
      nestedHarness: { name: codex.name, version: codex.version ?? null }
    };
  }

  async run(request, emit) {
    if (!this.capability()) throw new Error("Codex CLI is unavailable for capability verification");
    const payload = parsePayload(request.prompt);
    if (payload.approveWrite !== true) throw new Error("capability verification requires approveWrite=true");
    if ((payload.harnessId ?? "codex") !== "codex") throw new Error("only the codex harness is currently supported");
    const mode = payload.mode ?? "artifact-context";
    if (!["artifact-context", "native-discovery"].includes(mode)) throw new Error(`unsupported capability verification mode ${mode}`);
    const workspace = path.resolve(request.cwd);
    const nestedSessions = new Set();
    let sequence = 0;
    this.#active.set(request.sessionId, nestedSessions);
    const sessionIdFactory = () => {
      const id = `${request.sessionId}:capability:${++sequence}`;
      nestedSessions.add(id);
      return id;
    };

    emit({ kind: "status", status: "running", message: `Capability verification (${mode}) started`, at: new Date().toISOString() });
    try {
      let result;
      if (mode === "artifact-context") {
        const targetRoot = path.resolve(payload.targetRoot ?? workspace);
        assertWithinWorkspace(workspace, targetRoot);
        result = await verifyCapabilityWithAdapter({
          spec: payload.spec,
          harnessId: "codex",
          adapter: this.#codex,
          cwd: workspace,
          targetRoot,
          approveWrite: true,
          allowDegraded: payload.allowDegraded === true,
          retainInstallation: false,
          receiptPath: null,
          sessionIdFactory
        });
      } else {
        if (payload.workspaceRoot && path.resolve(payload.workspaceRoot) !== workspace) {
          throw new Error("native-discovery workspaceRoot must match the session cwd");
        }
        result = await verifyCodexNativeDiscovery({
          spec: payload.spec,
          adapter: this.#codex,
          workspaceRoot: workspace,
          approveWrite: true,
          receiptPath: null,
          sessionIdFactory
        });
      }

      emit({
        kind: "tool",
        name: "capability.verification.receipt",
        phase: "completed",
        payload: result.receipt,
        at: new Date().toISOString()
      });
      emit({
        kind: "text",
        text: JSON.stringify({
          capabilityId: result.receipt.capabilityId,
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
    const nested = this.#active.get(sessionId);
    if (!nested) return;
    await Promise.all([...nested].map((id) => this.#codex.interrupt(id)));
  }
}

function parsePayload(raw) {
  let payload;
  try { payload = JSON.parse(raw); }
  catch { throw new Error("capability verification prompt must be a JSON payload"); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !payload.spec) {
    throw new Error("capability verification payload requires spec");
  }
  return payload;
}

function assertWithinWorkspace(workspace, target) {
  if (target === workspace) return;
  if (!target.startsWith(`${workspace}${path.sep}`)) throw new Error("capability verification targetRoot must stay inside the session cwd");
}
