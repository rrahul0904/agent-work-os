import { copyFile, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { assertCapabilitySpec, CapabilityValidationError } from "./index.js";

export class CapabilityRuntimeError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "CapabilityRuntimeError";
    this.code = code;
  }
}

export async function addCapabilityToFileRegistry(registryPath, specInput) {
  const spec = assertCapabilitySpec(specInput);
  const state = await readRegistry(registryPath);
  if (state.capabilities.some((entry) => entry.id === spec.id && entry.version === spec.version)) {
    throw new CapabilityRuntimeError("capability_registry_version_exists");
  }
  state.capabilities.push(spec);
  state.capabilities.sort((a, b) => a.metadata.slug.localeCompare(b.metadata.slug) || compareSemver(b.version, a.version));
  await atomicWriteJson(registryPath, state);
  return spec;
}

export async function listCapabilitiesFromFileRegistry(registryPath, filters = {}) {
  const state = await readRegistry(registryPath);
  return state.capabilities.filter((spec) =>
    (!filters.kind || spec.kind === filters.kind) &&
    (!filters.tag || spec.metadata.tags.includes(filters.tag)) &&
    (!filters.sourceUrl || spec.provenance.sourceUrl === filters.sourceUrl)
  );
}

export async function resolveCapabilityFromFileRegistry(registryPath, slug, version = null) {
  const state = await readRegistry(registryPath);
  const matches = state.capabilities
    .filter((spec) => spec.metadata.slug === slug && (!version || spec.version === version))
    .sort((a, b) => compareSemver(b.version, a.version));
  return matches[0] ?? null;
}

export function createInstallPlan(compilation, targetRoot, { installId = `install_${randomUUID()}` } = {}) {
  if (!compilation?.manifest || !Array.isArray(compilation.files)) throw new CapabilityRuntimeError("compilation_invalid");
  const root = path.resolve(targetRoot);
  const files = compilation.files.map((file) => {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string") {
      throw new CapabilityRuntimeError("compilation_file_invalid");
    }
    return {
      path: normalizeRelativePath(file.path),
      content: file.content,
      digest: digest(file.content)
    };
  });
  return Object.freeze({
    schemaVersion: "1",
    installId,
    targetRoot: root,
    harnessId: compilation.manifest.harnessId,
    capabilityId: compilation.manifest.capabilityId,
    capabilityVersion: compilation.manifest.capabilityVersion,
    manifestDigest: digest(compilation.manifest),
    files
  });
}

export async function applyInstallPlan(plan, { approveWrite = false } = {}) {
  if (!approveWrite) throw new CapabilityRuntimeError("capability_install_write_not_approved");
  validateInstallPlan(plan);
  const root = path.resolve(plan.targetRoot);
  await ensureRootDirectory(root);
  const backupRoot = path.join(root, ".agent-work-os", "capability-backups", plan.installId);
  await assertPathHasNoSymlink(root, path.dirname(backupRoot));
  await mkdir(backupRoot, { recursive: true });

  const operations = [];
  for (const file of plan.files) {
    const target = safeJoin(root, file.path);
    await assertPathHasNoSymlink(root, path.dirname(target));
    await mkdir(path.dirname(target), { recursive: true });
    await assertNotSymlink(target);

    let previous = null;
    try {
      const stat = await lstat(target);
      if (!stat.isFile()) throw new CapabilityRuntimeError("capability_install_target_not_regular_file", target);
      const backupPath = safeJoin(backupRoot, file.path);
      await mkdir(path.dirname(backupPath), { recursive: true });
      await copyFile(target, backupPath);
      previous = { backupPath, digest: digest(await readFile(target)) };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    await atomicWriteFile(target, file.content);
    operations.push({
      relativePath: file.path,
      targetPath: target,
      installedDigest: digest(await readFile(target)),
      previous
    });
  }

  const receipt = {
    schemaVersion: "1",
    installId: plan.installId,
    targetRoot: root,
    harnessId: plan.harnessId,
    capabilityId: plan.capabilityId,
    capabilityVersion: plan.capabilityVersion,
    manifestDigest: plan.manifestDigest,
    installedAt: new Date().toISOString(),
    operations
  };
  receipt.receiptDigest = digest(receipt);
  const receiptPath = path.join(backupRoot, "install-receipt.json");
  await atomicWriteJson(receiptPath, receipt);
  return { receipt: Object.freeze(receipt), receiptPath };
}

export async function rollbackInstall(receiptInput, { force = false } = {}) {
  const receipt = typeof receiptInput === "string" ? JSON.parse(await readFile(path.resolve(receiptInput), "utf8")) : receiptInput;
  validateInstallReceipt(receipt);
  const root = path.resolve(receipt.targetRoot);
  const results = [];

  for (const operation of [...receipt.operations].reverse()) {
    const target = safeJoin(root, operation.relativePath);
    await assertPathHasNoSymlink(root, path.dirname(target));
    await assertNotSymlink(target);

    let currentExists = true;
    let currentDigest = null;
    try {
      currentDigest = digest(await readFile(target));
    } catch (error) {
      if (error?.code === "ENOENT") currentExists = false;
      else throw error;
    }

    if (!force && currentExists && currentDigest !== operation.installedDigest) {
      throw new CapabilityRuntimeError("capability_rollback_target_drifted", operation.relativePath);
    }

    if (operation.previous) {
      const backupPath = path.resolve(operation.previous.backupPath);
      if (!backupPath.startsWith(`${root}${path.sep}`)) throw new CapabilityRuntimeError("capability_backup_outside_target_root");
      await assertNotSymlink(backupPath);
      await mkdir(path.dirname(target), { recursive: true });
      const contents = await readFile(backupPath);
      if (!force && digest(contents) !== operation.previous.digest) {
        throw new CapabilityRuntimeError("capability_backup_digest_mismatch", operation.relativePath);
      }
      await atomicWriteFile(target, contents);
      results.push({ relativePath: operation.relativePath, action: "restored" });
    } else {
      await rm(target, { force: true });
      results.push({ relativePath: operation.relativePath, action: "removed" });
    }
  }

  return Object.freeze({ installId: receipt.installId, rolledBackAt: new Date().toISOString(), results });
}

async function readRegistry(registryPath) {
  const target = path.resolve(registryPath);
  try {
    const parsed = JSON.parse(await readFile(target, "utf8"));
    if (parsed?.schemaVersion !== "1" || !Array.isArray(parsed.capabilities)) {
      throw new CapabilityRuntimeError("capability_registry_invalid");
    }
    for (const spec of parsed.capabilities) assertCapabilitySpec(spec);
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return { schemaVersion: "1", capabilities: [] };
    if (error instanceof CapabilityValidationError || error instanceof CapabilityRuntimeError) throw error;
    if (error instanceof SyntaxError) throw new CapabilityRuntimeError("capability_registry_invalid_json");
    throw error;
  }
}

function validateInstallPlan(plan) {
  if (!plan || plan.schemaVersion !== "1" || !plan.installId || !plan.targetRoot || !Array.isArray(plan.files)) {
    throw new CapabilityRuntimeError("capability_install_plan_invalid");
  }
  for (const file of plan.files) normalizeRelativePath(file.path);
}

function validateInstallReceipt(receipt) {
  if (!receipt || receipt.schemaVersion !== "1" || !receipt.installId || !receipt.targetRoot || !Array.isArray(receipt.operations)) {
    throw new CapabilityRuntimeError("capability_install_receipt_invalid");
  }
}

function normalizeRelativePath(value) {
  if (typeof value !== "string" || !value || path.isAbsolute(value)) throw new CapabilityRuntimeError("compiled_path_invalid");
  const normalized = path.normalize(value);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) throw new CapabilityRuntimeError("compiled_path_escapes_output_root");
  return normalized;
}

function safeJoin(root, relative) {
  const target = path.resolve(root, normalizeRelativePath(relative));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new CapabilityRuntimeError("compiled_path_escapes_output_root");
  return target;
}

async function ensureRootDirectory(root) {
  try {
    const stat = await lstat(root);
    if (stat.isSymbolicLink()) throw new CapabilityRuntimeError("capability_target_root_symlink_refused");
    if (!stat.isDirectory()) throw new CapabilityRuntimeError("capability_target_root_not_directory");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(root, { recursive: true });
  }
}

async function assertPathHasNoSymlink(root, targetDir) {
  const relative = path.relative(root, targetDir);
  if (relative.startsWith("..")) throw new CapabilityRuntimeError("compiled_path_escapes_output_root");
  let cursor = root;
  await assertNotSymlink(cursor);
  if (!relative) return;
  for (const part of relative.split(path.sep)) {
    cursor = path.join(cursor, part);
    await assertNotSymlink(cursor);
  }
}

async function assertNotSymlink(target) {
  try {
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) throw new CapabilityRuntimeError("capability_symlink_refused", target);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
}

async function atomicWriteJson(filename, value) {
  await atomicWriteFile(path.resolve(filename), `${JSON.stringify(value, null, 2)}\n`);
}

async function atomicWriteFile(filename, content) {
  const target = path.resolve(filename);
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temp, content);
  await rename(temp, target);
}

function digest(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : JSON.stringify(sortValue(value)));
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function compareSemver(a, b) {
  const pa = a.split(/[.-]/).slice(0, 3).map(Number);
  const pb = b.split(/[.-]/).slice(0, 3).map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return a.localeCompare(b);
}
