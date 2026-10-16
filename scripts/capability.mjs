#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  HARNESS_PROFILES,
  assertCapabilitySpec,
  compileCapability,
  createDriftRecord,
  importReaCapability
} from "../packages/capability-fabric/src/index.js";
import {
  addCapabilityToFileRegistry,
  applyInstallPlan,
  createInstallPlan,
  listCapabilitiesFromFileRegistry,
  resolveCapabilityFromFileRegistry,
  rollbackInstall
} from "../packages/capability-fabric/src/runtime.js";

const [command, ...args] = process.argv.slice(2);

try {
  if (command === "profiles") {
    print(Object.values(HARNESS_PROFILES));
  } else if (command === "import") {
    const [evidencePath, outputPath] = args;
    requireArgs(command, [evidencePath, outputPath]);
    const spec = importReaCapability(await readJson(evidencePath));
    await writeJson(outputPath, spec);
    print({ ok: true, action: "import", outputPath, capabilityId: spec.id, slug: spec.metadata.slug });
  } else if (command === "compile") {
    const [specPath, harnessId, outputDir, ...flags] = args;
    requireArgs(command, [specPath, harnessId, outputDir]);
    const spec = assertCapabilitySpec(await readJson(specPath));
    const result = compileCapability(spec, harnessId, { allowDegraded: flags.includes("--allow-degraded") });
    const root = path.resolve(outputDir);
    await mkdir(root, { recursive: true });
    for (const file of result.files) {
      const target = safeJoin(root, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf8");
    }
    await writeJson(path.join(root, "capability-manifest.json"), result.manifest);
    await writeJson(path.join(root, "verification-receipt.json"), result.receipt);
    print({ ok: true, action: "compile", harnessId, capabilityId: spec.id, outputDir: root, fileCount: result.files.length, warnings: result.manifest.warnings, degraded: result.manifest.degraded, receiptDigest: result.receipt.receiptDigest });
  } else if (command === "install") {
    const [specPath, harnessId, targetRoot, ...flags] = args;
    requireArgs(command, [specPath, harnessId, targetRoot]);
    const spec = assertCapabilitySpec(await readJson(specPath));
    const compilation = compileCapability(spec, harnessId, { allowDegraded: flags.includes("--allow-degraded") });
    const plan = createInstallPlan(compilation, targetRoot);
    const installed = await applyInstallPlan(plan, { approveWrite: flags.includes("--approve-write") });
    print({ ok: true, action: "install", harnessId, capabilityId: spec.id, targetRoot: path.resolve(targetRoot), receiptPath: installed.receiptPath, receiptDigest: installed.receipt.receiptDigest });
  } else if (command === "rollback") {
    const [receiptPath, ...flags] = args;
    requireArgs(command, [receiptPath]);
    print({ ok: true, action: "rollback", ...(await rollbackInstall(receiptPath, { force: flags.includes("--force") })) });
  } else if (command === "registry-add") {
    const [registryPath, specPath] = args;
    requireArgs(command, [registryPath, specPath]);
    const spec = await addCapabilityToFileRegistry(registryPath, assertCapabilitySpec(await readJson(specPath)));
    print({ ok: true, action: "registry-add", registryPath: path.resolve(registryPath), capabilityId: spec.id, version: spec.version });
  } else if (command === "registry-list") {
    const [registryPath, ...flags] = args;
    requireArgs(command, [registryPath]);
    print(await listCapabilitiesFromFileRegistry(registryPath, parseFilters(flags)));
  } else if (command === "registry-resolve") {
    const [registryPath, slug, version] = args;
    requireArgs(command, [registryPath, slug]);
    const spec = await resolveCapabilityFromFileRegistry(registryPath, slug, version ?? null);
    if (!spec) throw new Error("capability_not_found");
    print(spec);
  } else if (command === "drift") {
    const [previousPath, currentPath] = args;
    requireArgs(command, [previousPath, currentPath]);
    print(createDriftRecord({ previous: assertCapabilitySpec(await readJson(previousPath)), current: assertCapabilitySpec(await readJson(currentPath)) }));
  } else {
    process.stderr.write("Usage:\n  npm run capability -- profiles\n  npm run capability -- import <rea-evidence.json> <capability.json>\n  npm run capability -- compile <capability.json> <harness> <output-dir> [--allow-degraded]\n  npm run capability -- install <capability.json> <harness> <target-root> --approve-write [--allow-degraded]\n  npm run capability -- rollback <install-receipt.json> [--force]\n  npm run capability -- registry-add <registry.json> <capability.json>\n  npm run capability -- registry-list <registry.json> [--kind=x] [--tag=x] [--source-url=x]\n  npm run capability -- registry-resolve <registry.json> <slug> [version]\n  npm run capability -- drift <previous.json> <current.json>\n");
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.code ?? error.name ?? "capability_command_failed", message: error.message })}\n`);
  process.exitCode = 1;
}

async function readJson(filename) { return JSON.parse(await readFile(path.resolve(filename), "utf8")); }
async function writeJson(filename, value) {
  const target = path.resolve(filename);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function safeJoin(root, relative) {
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("compiled_path_escapes_output_root");
  return target;
}
function requireArgs(commandName, values) { if (values.some((value) => !value)) throw new Error(`${commandName}_arguments_required`); }
function print(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function parseFilters(flags) {
  const result = {};
  for (const flag of flags) {
    if (flag.startsWith("--kind=")) result.kind = flag.slice(7);
    else if (flag.startsWith("--tag=")) result.tag = flag.slice(6);
    else if (flag.startsWith("--source-url=")) result.sourceUrl = flag.slice(13);
  }
  return result;
}
