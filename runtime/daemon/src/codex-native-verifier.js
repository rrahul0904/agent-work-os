import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertCapabilitySpec, compileCapability } from "../../../packages/capability-fabric/src/index.js";
import { applyInstallPlan, createInstallPlan, rollbackInstall } from "../../../packages/capability-fabric/src/runtime.js";
import { CapabilityVerificationError } from "./capability-verifier.js";

const MARKETPLACE_NAME = "agent-work-os-verification";

export async function verifyCodexNativeDiscovery({
  spec: specInput,
  adapter,
  workspaceRoot,
  approveWrite = false,
  receiptPath = null,
  now = () => new Date().toISOString(),
  sessionIdFactory = () => `codex-native-verify-${randomUUID()}`
}) {
  const spec = assertCapabilitySpec(specInput);
  if (!["skill", "command"].includes(spec.kind)) {
    throw new CapabilityVerificationError("codex_native_discovery_kind_unsupported");
  }
  if (!spec.evaluation?.testCases?.length) throw new CapabilityVerificationError("capability_verification_test_cases_required");
  if (!adapter || typeof adapter.run !== "function") throw new CapabilityVerificationError("capability_verification_adapter_invalid");
  const adapterCapability = typeof adapter.capability === "function" ? adapter.capability() : { name: adapter.name ?? "codex" };
  if (!adapterCapability) throw new CapabilityVerificationError("capability_verification_adapter_unavailable");

  const root = path.resolve(workspaceRoot);
  await assertCleanVerificationWorkspace(root, spec.metadata.slug);
  const bundle = createCodexNativeDiscoveryBundle(spec);
  const plan = createInstallPlan(bundle.compilation, root);
  const installation = await applyInstallPlan(plan, { approveWrite });
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
          cwd: root,
          prompt: buildNativeDiscoveryPrompt(spec, testCase)
        }, (event) => events.push(event));
        nativeSessionId = result?.nativeSessionId ?? null;
      } catch (error) {
        runError = error?.message ?? String(error);
        events.push({ kind: "error", message: runError, at: now() });
      }

      const completedAt = now();
      const output = events.filter((event) => event?.kind === "text" && typeof event.text === "string").map((event) => event.text).join("\n");
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
      harnessId: "codex",
      harness: {
        name: adapterCapability.name ?? "codex",
        executable: adapterCapability.executable ?? null,
        version: adapterCapability.version ?? null
      },
      source: {
        url: spec.provenance.sourceUrl,
        commit: spec.provenance.sourceCommit,
        license: spec.provenance.sourceLicense
      },
      plugin: {
        marketplace: MARKETPLACE_NAME,
        name: spec.metadata.slug,
        invocation: `$${spec.metadata.slug}`,
        packageManifest: `plugins/${spec.metadata.slug}/plugin.json`
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

export function createCodexNativeDiscoveryBundle(specInput) {
  const spec = assertCapabilitySpec(specInput);
  if (!["skill", "command"].includes(spec.kind)) {
    throw new CapabilityVerificationError("codex_native_discovery_kind_unsupported");
  }
  const baseCompilation = compileCapability(spec, "codex");
  const probeMarker = `AWOS_DISCOVERY_${digest({ id: spec.id, version: spec.version, source: spec.provenance.sourceCommit }).slice(7, 23).toUpperCase()}`;
  const pluginRoot = `plugins/${spec.metadata.slug}`;
  const files = [];

  for (const file of baseCompilation.files) {
    let content = file.content;
    if (/\/SKILL\.md$/i.test(file.path)) {
      content = `${content.trimEnd()}\n\n## Agent Work OS native-discovery probe\n\nWhen a verification request asks for the capability discovery marker, include exactly \`${probeMarker}\` in the response.\n`;
    }
    files.push({ path: `${pluginRoot}/${file.path}`, content });
  }

  files.push({
    path: `${pluginRoot}/plugin.json`,
    content: `${JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: spec.metadata.slug,
      version: spec.version,
      description: spec.metadata.description || spec.metadata.name
    }, null, 2)}\n`
  });
  files.push({
    path: ".agents/plugins/marketplace.json",
    content: `${JSON.stringify({
      name: MARKETPLACE_NAME,
      plugins: [{
        name: spec.metadata.slug,
        source: { source: "local", path: `./plugins/${spec.metadata.slug}` },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Productivity"
      }]
    }, null, 2)}\n`
  });
  files.push({
    path: ".codex/config.toml",
    content: `[plugins.${JSON.stringify(`${spec.metadata.slug}@${MARKETPLACE_NAME}`)}]\nenabled = true\n`
  });

  const manifest = {
    capabilityId: spec.id,
    capabilityVersion: spec.version,
    harnessId: "codex",
    verificationMode: "native-discovery",
    sourceCommit: spec.provenance.sourceCommit,
    sourceLicense: spec.provenance.sourceLicense,
    probeMarkerDigest: digest(probeMarker),
    files: files.map((file) => ({ path: file.path, digest: digest(file.content), bytes: Buffer.byteLength(file.content) }))
  };

  return {
    probeMarker,
    baseCompilation,
    compilation: { manifest, files }
  };
}

function buildNativeDiscoveryPrompt(spec, testCase) {
  return [
    `Use the $${spec.metadata.slug} skill from the enabled local plugin for this request.`,
    "The skill contains an Agent Work OS capability discovery marker. Include that marker verbatim in your response, then perform the task.",
    "Do not invent a marker and do not discuss the verification framework.",
    "",
    "TASK:",
    testCase.input
  ].join("\n");
}

async function assertCleanVerificationWorkspace(root, slug) {
  for (const relative of [
    ".agents/plugins/marketplace.json",
    ".codex/config.toml",
    `plugins/${slug}`
  ]) {
    const target = path.join(root, relative);
    try {
      await lstat(target);
      throw new CapabilityVerificationError("codex_native_discovery_workspace_conflict", relative);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
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
