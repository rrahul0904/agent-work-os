import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertCapabilitySpec, compileCapability } from "../../../packages/capability-fabric/src/index.js";
import { applyInstallPlan, createInstallPlan, rollbackInstall } from "../../../packages/capability-fabric/src/runtime.js";
import { CapabilityVerificationError } from "./capability-verifier.js";

export async function verifyOpenCodeNativeDiscovery({
  spec: specInput,
  adapter,
  workspaceRoot,
  approveWrite = false,
  receiptPath = null,
  now = () => new Date().toISOString(),
  sessionIdFactory = () => `opencode-native-verify-${randomUUID()}`
}) {
  const spec = assertCapabilitySpec(specInput);
  if (spec.kind !== "skill") throw new CapabilityVerificationError("opencode_native_discovery_kind_unsupported");
  if (!spec.evaluation?.testCases?.length) throw new CapabilityVerificationError("capability_verification_test_cases_required");
  if (!adapter || typeof adapter.run !== "function") throw new CapabilityVerificationError("capability_verification_adapter_invalid");
  const adapterCapability = typeof adapter.capability === "function" ? adapter.capability() : { name: adapter.name ?? "opencode" };
  if (!adapterCapability) throw new CapabilityVerificationError("capability_verification_adapter_unavailable");

  const root = path.resolve(workspaceRoot);
  await assertCleanVerificationWorkspace(root, spec.metadata.slug);
  const bundle = createOpenCodeNativeDiscoveryBundle(spec);
  const plan = createInstallPlan(bundle.compilation, root);
  const installation = await applyInstallPlan(plan, { approveWrite });
  const cases = [];
  let rollback = null;

  try {
    for (const testCase of spec.evaluation.testCases) {
      const events = [];
      const startedAt = now();
      let nativeSessionId = null;
      let runError = null;
      try {
        const result = await adapter.run({
          sessionId: sessionIdFactory(),
          nativeSessionId: null,
          cwd: root,
          prompt: buildNativeDiscoveryPrompt(spec, testCase)
        }, (event) => events.push(event));
        nativeSessionId = result?.nativeSessionId ?? null;
      } catch (error) {
        runError = error?.message ?? String(error);
        events.push({ kind: "error", message: runError, at: now() });
      }

      const completedAt = now();
      const output = events
        .filter((event) => event?.kind === "text" && typeof event.text === "string")
        .map((event) => event.text)
        .join("\n");
      const status = terminalStatus(events);
      const errorCount = events.filter((event) => event?.kind === "error").length;
      const discoveryMarkerMatched = output.includes(bundle.probeMarker);
      const expectationMatched = matchesExpectation(output, testCase.expected);
      const passed = status === "completed" && errorCount === 0 && discoveryMarkerMatched && expectationMatched;
      cases.push({
        id: testCase.id,
        passed,
        expected: testCase.expected,
        status,
        errorCount,
        discoveryMarkerMatched,
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
    const rollbackResult = await rollbackInstall(installation.receipt);
    rollback = { attempted: true, ok: true, result: rollbackResult };

    const receipt = {
      schemaVersion: "1",
      verificationMode: "native-discovery",
      capabilityId: spec.id,
      capabilityVersion: spec.version,
      capabilityDigest: digest(spec),
      harnessId: "opencode",
      harness: {
        name: adapterCapability.name ?? "opencode",
        executable: adapterCapability.executable ?? null,
        version: adapterCapability.version ?? null
      },
      source: {
        url: spec.provenance.sourceUrl,
        commit: spec.provenance.sourceCommit,
        license: spec.provenance.sourceLicense
      },
      skill: {
        name: spec.metadata.slug,
        discovery: "native-skill-tool",
        path: `.opencode/skills/${spec.metadata.slug}/SKILL.md`
      },
      probe: {
        marker: bundle.probeMarker,
        markerDigest: digest(bundle.probeMarker),
        baseCompilationReceiptDigest: bundle.baseCompilation.receipt.receiptDigest,
        instrumentedBundleDigest: digest(bundle.compilation.manifest)
      },
      installReceiptDigest: installation.receipt.receiptDigest,
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
      try { await rollbackInstall(installation.receipt); } catch {}
    }
    throw error;
  }
}

export function createOpenCodeNativeDiscoveryBundle(specInput) {
  const spec = assertCapabilitySpec(specInput);
  if (spec.kind !== "skill") throw new CapabilityVerificationError("opencode_native_discovery_kind_unsupported");
  const baseCompilation = compileCapability(spec, "opencode");
  const probeMarker = `AWOS_OPENCODE_DISCOVERY_${digest({ id: spec.id, version: spec.version, source: spec.provenance.sourceCommit }).slice(7, 23).toUpperCase()}`;
  const files = baseCompilation.files.map((file) => {
    if (!file.path.startsWith(".opencode/skills/")) throw new CapabilityVerificationError("opencode_native_discovery_compilation_path_invalid");
    let content = file.content;
    if (/\/SKILL\.md$/i.test(file.path)) {
      content = `${content.trimEnd()}\n\n## Agent Work OS native-discovery probe\n\nWhen this skill is loaded for verification, include exactly \`${probeMarker}\` in the response before performing the requested task.\n`;
    }
    return { path: file.path, content };
  });
  const manifest = {
    capabilityId: spec.id,
    capabilityVersion: spec.version,
    harnessId: "opencode",
    verificationMode: "native-discovery",
    sourceCommit: spec.provenance.sourceCommit,
    sourceLicense: spec.provenance.sourceLicense,
    probeMarkerDigest: digest(probeMarker),
    files: files.map((file) => ({ path: file.path, digest: digest(file.content), bytes: Buffer.byteLength(file.content) }))
  };
  return { probeMarker, baseCompilation, compilation: { manifest, files } };
}

function buildNativeDiscoveryPrompt(spec, testCase) {
  return [
    `Use the native OpenCode skill named ${spec.metadata.slug} for this request.`,
    "Load that skill with the native skill tool before answering; do not read the SKILL.md file directly with a filesystem tool.",
    "The skill contains an Agent Work OS capability discovery marker; include that marker verbatim in your response.",
    "Do not invent a marker and do not discuss the verification framework.",
    "",
    testCase.input
  ].join("\n");
}

async function assertCleanVerificationWorkspace(root, slug) {
  const target = path.join(root, ".opencode", "skills", slug);
  try {
    await lstat(target);
    throw new CapabilityVerificationError("opencode_native_discovery_workspace_conflict", `.opencode/skills/${slug}`);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
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

function digest(value) {
  const content = typeof value === "string" ? value : JSON.stringify(sortValue(value));
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
