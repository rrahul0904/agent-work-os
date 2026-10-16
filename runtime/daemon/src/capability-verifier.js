import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertCapabilitySpec, compileCapability } from "../../../packages/capability-fabric/src/index.js";
import { applyInstallPlan, createInstallPlan, rollbackInstall } from "../../../packages/capability-fabric/src/runtime.js";

export class CapabilityVerificationError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "CapabilityVerificationError";
    this.code = code;
  }
}

export async function verifyCapabilityWithAdapter({
  spec: specInput,
  harnessId,
  adapter,
  cwd,
  targetRoot,
  approveWrite = false,
  allowDegraded = false,
  retainInstallation = false,
  receiptPath = null,
  now = () => new Date().toISOString(),
  sessionIdFactory = () => `capability-verify-${randomUUID()}`
}) {
  const spec = assertCapabilitySpec(specInput);
  if (!harnessId) throw new CapabilityVerificationError("capability_verification_harness_required");
  if (!adapter || typeof adapter.run !== "function") throw new CapabilityVerificationError("capability_verification_adapter_invalid");
  if (!cwd) throw new CapabilityVerificationError("capability_verification_cwd_required");
  if (!targetRoot) throw new CapabilityVerificationError("capability_verification_target_root_required");
  if (!spec.evaluation?.testCases?.length) throw new CapabilityVerificationError("capability_verification_test_cases_required");

  const adapterCapability = typeof adapter.capability === "function" ? adapter.capability() : { name: adapter.name ?? harnessId };
  if (!adapterCapability) throw new CapabilityVerificationError("capability_verification_adapter_unavailable");

  const compilation = compileCapability(spec, harnessId, { allowDegraded });
  const plan = createInstallPlan(compilation, targetRoot);
  const installation = await applyInstallPlan(plan, { approveWrite });
  const installedArtifacts = await readInstalledArtifacts(plan.targetRoot, compilation.files);
  const artifactContext = renderArtifactContext(installedArtifacts);
  const cases = [];
  let rollback = null;

  try {
    for (const testCase of spec.evaluation.testCases) {
      const events = [];
      const startedAt = now();
      let runError = null;
      let nativeSessionId = null;
      const sessionId = sessionIdFactory();
      try {
        const result = await adapter.run({
          sessionId,
          nativeSessionId: null,
          cwd: path.resolve(cwd),
          prompt: buildVerificationPrompt(spec, artifactContext, testCase)
        }, (event) => events.push(event));
        nativeSessionId = result?.nativeSessionId ?? null;
      } catch (error) {
        runError = error?.message ?? String(error);
        events.push({ kind: "error", message: runError, at: now() });
      }

      const completedAt = now();
      const output = events.filter((event) => event?.kind === "text" && typeof event.text === "string").map((event) => event.text).join("\n");
      const status = terminalStatus(events);
      const errorCount = events.filter((event) => event?.kind === "error").length + (runError ? 1 : 0);
      const expectationMatched = matchesExpectation(output, testCase.expected);
      const passed = status === "completed" && errorCount === 0 && expectationMatched;
      cases.push({
        id: testCase.id,
        passed,
        expected: testCase.expected,
        status,
        errorCount,
        expectationMatched,
        outputDigest: digest(output),
        eventTraceDigest: digest(events),
        nativeSessionId,
        startedAt,
        completedAt
      });
    }

    const passedCount = cases.filter((entry) => entry.passed).length;
    const score = cases.length ? passedCount / cases.length : 0;
    const passed = score >= spec.evaluation.qualityThreshold;

    if (!retainInstallation || !passed) {
      const result = await rollbackInstall(installation.receipt);
      rollback = { attempted: true, ok: true, result };
    } else {
      rollback = { attempted: false, ok: true, result: null };
    }

    const receipt = {
      schemaVersion: "1",
      verificationMode: "artifact-context",
      capabilityId: spec.id,
      capabilityVersion: spec.version,
      capabilityDigest: digest(spec),
      harnessId,
      harness: {
        name: adapterCapability.name ?? harnessId,
        executable: adapterCapability.executable ?? null,
        version: adapterCapability.version ?? null
      },
      source: {
        url: spec.provenance.sourceUrl,
        commit: spec.provenance.sourceCommit,
        license: spec.provenance.sourceLicense
      },
      compilationReceiptDigest: compilation.receipt.receiptDigest,
      installReceiptDigest: installation.receipt.receiptDigest,
      artifacts: installedArtifacts.map((artifact) => ({ path: artifact.path, digest: digest(artifact.content), bytes: Buffer.byteLength(artifact.content) })),
      qualityThreshold: spec.evaluation.qualityThreshold,
      score,
      passed,
      cases,
      rollback,
      verifiedAt: now()
    };
    receipt.receiptDigest = digest(receipt);
    const frozen = Object.freeze(receipt);
    if (receiptPath) await writeReceipt(receiptPath, frozen);
    return { receipt: frozen, installationReceiptPath: installation.receiptPath, receiptPath: receiptPath ? path.resolve(receiptPath) : null };
  } catch (error) {
    if (!rollback) {
      try {
        await rollbackInstall(installation.receipt);
      } catch {
        // Preserve the original verification error. Rollback failures are surfaced in normal receipts when verification completes.
      }
    }
    throw error;
  }
}

function buildVerificationPrompt(spec, artifactContext, testCase) {
  return [
    "You are executing a capability verification case.",
    "Use the compiled capability artifact below as the governing instructions for this case.",
    "Do not discuss the verification framework; perform the requested work directly.",
    "",
    artifactContext,
    "",
    "TEST INPUT:",
    testCase.input,
    "",
    `Capability: ${spec.metadata.name}`
  ].join("\n");
}

async function readInstalledArtifacts(targetRoot, files) {
  const root = path.resolve(targetRoot);
  const artifacts = [];
  for (const file of files) {
    const target = safeJoin(root, file.path);
    artifacts.push({ path: file.path, content: await readFile(target, "utf8") });
  }
  return artifacts;
}

function renderArtifactContext(artifacts) {
  return artifacts.map((artifact) => [
    `--- BEGIN ARTIFACT ${artifact.path} ---`,
    artifact.content,
    `--- END ARTIFACT ${artifact.path} ---`
  ].join("\n")).join("\n\n");
}

function terminalStatus(events) {
  const statuses = events.filter((event) => event?.kind === "status" && typeof event.status === "string");
  return statuses.at(-1)?.status ?? "unknown";
}

function matchesExpectation(output, expected) {
  if (!expected) return true;
  return output.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
}

async function writeReceipt(filename, receipt) {
  const target = path.resolve(filename);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

function safeJoin(root, relative) {
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new CapabilityVerificationError("capability_verification_artifact_path_invalid");
  return target;
}

function digest(value) {
  const content = typeof value === "string" ? value : JSON.stringify(sortValue(value));
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
