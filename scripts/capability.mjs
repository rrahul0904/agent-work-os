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

const [command, ...args] = process.argv.slice(2);

try {
  if (command === "profiles") {
    process.stdout.write(`${JSON.stringify(Object.values(HARNESS_PROFILES), null, 2)}\n`);
  } else if (command === "import") {
    const [evidencePath, outputPath] = args;
    requireArgs(command, [evidencePath, outputPath]);
    const evidence = await readJson(evidencePath);
    const spec = importReaCapability(evidence);
    await writeJson(outputPath, spec);
    print({ ok: true, action: "import", outputPath, capabilityId: spec.id, slug: spec.metadata.slug });
  } else if (command === "compile") {
    const [specPath, harnessId, outputDir, ...flags] = args;
    requireArgs(command, [specPath, harnessId, outputDir]);
    const spec = assertCapabilitySpec(await readJson(specPath));
    const allowDegraded = flags.includes("--allow-degraded");
    const result = compileCapability(spec, harnessId, { allowDegraded });
    const root = path.resolve(outputDir);
    await mkdir(root, { recursive: true });
    for (const file of result.files) {
      const target = safeJoin(root, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf8");
    }
    await writeJson(path.join(root, "capability-manifest.json"), result.manifest);
    await writeJson(path.join(root, "verification-receipt.json"), result.receipt);
    print({
      ok: true,
      action: "compile",
      harnessId,
      capabilityId: spec.id,
      outputDir: root,
      fileCount: result.files.length,
      warnings: result.manifest.warnings,
      degraded: result.manifest.degraded,
      receiptDigest: result.receipt.receiptDigest
    });
  } else if (command === "drift") {
    const [previousPath, currentPath] = args;
    requireArgs(command, [previousPath, currentPath]);
    const previous = assertCapabilitySpec(await readJson(previousPath));
    const current = assertCapabilitySpec(await readJson(currentPath));
    print(createDriftRecord({ previous, current }));
  } else {
    process.stderr.write("Usage:\n  npm run capability -- profiles\n  npm run capability -- import <rea-evidence.json> <capability.json>\n  npm run capability -- compile <capability.json> <harness> <output-dir> [--allow-degraded]\n  npm run capability -- drift <previous.json> <current.json>\n");
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.code ?? error.name ?? "capability_command_failed", message: error.message })}\n`);
  process.exitCode = 1;
}

async function readJson(filename) {
  return JSON.parse(await readFile(path.resolve(filename), "utf8"));
}

async function writeJson(filename, value) {
  const target = path.resolve(filename);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeJoin(root, relative) {
  const target = path.resolve(root, relative);
  const prefix = `${root}${path.sep}`;
  if (target !== root && !target.startsWith(prefix)) throw new Error("compiled_path_escapes_output_root");
  return target;
}

function requireArgs(commandName, values) {
  if (values.some((value) => !value)) throw new Error(`${commandName}_arguments_required`);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
