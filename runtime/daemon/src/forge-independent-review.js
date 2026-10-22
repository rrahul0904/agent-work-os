// Run independent, read-only worktree evaluation in a separate Node process.
// Only sanitized receipts are accepted as input and emitted as output.
// No user-supplied program, npm install, git apply, commit or test script runs.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const verifier = fileURLToPath(new URL("../../verifier/forge-readonly-verifier.js", import.meta.url));
export function runForgeIndependentReview(stage, diff, root, { timeoutMs = 20000 } = {}) {
  if (!stage || !diff || typeof root !== "string") return Promise.reject(new Error("forge_review_input_missing"));
  return new Promise((resolve, reject) => {
    const processHandle = spawn(process.execPath, [verifier], {
      cwd: path.dirname(verifier),
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let output = "";
    let err = "";
    let finished = false;
    const settle = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => {
      processHandle.kill("SIGKILL");
      settle(new Error("forge_review_timeout"));
    }, timeoutMs);
    processHandle.stdout.on("data", chunk => {
      output += String(chunk);
      if (output.length > 32000) {
        processHandle.kill("SIGKILL"); settle(new Error("forge_review_output_too_large"));
      }
    });
    processHandle.stderr.on("data", chunk => {
      err += String(chunk);
      if (err.length > 2048) {
        processHandle.kill("SIGKILL"); settle(new Error("forge_review_error_too_large"));
      }
    });
    processHandle.on("error", () => settle(new Error("forge_review_process_unavailable")));
    processHandle.on("close", code => {
      if (finished) return;
      let parsed;
      try { parsed = JSON.parse(output); } catch {
        settle(new Error("forge_review_malformed_result")); return;
      }
      if (!parsed || parsed.schema !== "rea-forge-independent-diff-review/v1" ||
          ![0, 2].includes(code) || parsed.passed !== (code === 0)) {
        settle(new Error("forge_review_result_mismatch")); return;
      }
      settle(null, parsed);
    });
    processHandle.stdin.on("error", () => settle(new Error("forge_review_transport_error")));
    processHandle.stdin.end(JSON.stringify({ stage, diff, root }));
  });
}
