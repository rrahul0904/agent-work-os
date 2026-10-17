import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import ts from "@typescript/typescript6";

import { canonicalDigest } from "./index.js";

export const REPO_MODULE_RESOLUTION_SCHEMA = "repo-module-resolution/v1";

const CONFIG_NAMES = new Set(["tsconfig.json", "jsconfig.json"]);
const SOURCE_EXTENSIONS = Object.freeze([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"]);
const MAX_EXTENDS_DEPTH = 10;

export class RepoModuleResolutionError extends Error {
  constructor(code, message, details = {}) {
    super(message ?? code);
    this.name = "RepoModuleResolutionError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export async function analyzeModuleResolution(rootPath, repoMap, importAnalysis) {
  assertRepoMap(repoMap);
  assertImportAnalysis(importAnalysis, repoMap.digest);

  const realRoot = await realpath(path.resolve(rootPath));
  const fileSet = new Set(repoMap.files.map((file) => normalizePath(file.path)));
  const configPaths = repoMap.files
    .map((file) => normalizePath(file.path))
    .filter((filePath) => CONFIG_NAMES.has(path.posix.basename(filePath)))
    .sort();
  const packagePaths = repoMap.files
    .map((file) => normalizePath(file.path))
    .filter((filePath) => path.posix.basename(filePath) === "package.json")
    .sort();

  const internalConfigs = [];
  for (const configPath of configPaths) {
    internalConfigs.push(await loadConfig(realRoot, configPath, fileSet, new Set(), 0));
  }
  const configs = internalConfigs.map((config) => publicConfig(config)).sort((a, b) => a.path.localeCompare(b.path));
  const workspacePackages = await loadWorkspacePackages(realRoot, packagePaths, fileSet);
  const workspaceByName = new Map(workspacePackages.filter((item) => item.name).map((item) => [item.name, item]));

  const resolutions = importAnalysis.edges.map((edge) => {
    const config = nearestConfig(edge.from, internalConfigs);
    return Object.freeze(resolveEdge(edge, config, workspaceByName, fileSet));
  }).sort(resolutionSort);

  const counts = Object.create(null);
  for (const item of resolutions) counts[item.resolutionKind] = (counts[item.resolutionKind] ?? 0) + 1;
  const unsupportedExtends = configs.filter((config) => config.externalExtends !== null).length;
  const unsupportedPathPatterns = internalConfigs.reduce((sum, config) => sum + config.unsupportedPathPatterns, 0);

  const payload = {
    schemaVersion: REPO_MODULE_RESOLUTION_SCHEMA,
    repositoryDigest: repoMap.digest,
    importAnalysisDigest: importAnalysis.digest,
    configs: Object.freeze(configs),
    workspacePackages: Object.freeze(workspacePackages),
    resolutions: Object.freeze(resolutions),
    metrics: Object.freeze({
      configs: configs.length,
      workspacePackages: workspacePackages.length,
      imports: resolutions.length,
      resolvedFiles: resolutions.filter((item) => typeof item.targetFile === "string").length,
      tsconfigPathResolved: counts["tsconfig-path"] ?? 0,
      baseUrlResolved: counts["base-url"] ?? 0,
      workspaceResolved: counts["workspace-package"] ?? 0,
      relativeResolved: counts["relative-file"] ?? 0,
      externalPackages: counts["external-package"] ?? 0,
      unresolved: (counts["unresolved-relative"] ?? 0) + (counts["unresolved-alias"] ?? 0),
      unsupportedExtends,
      unsupportedPathPatterns
    }),
    methodology: Object.freeze({
      label: "static-semantic-module-resolution",
      configExecution: false,
      projectCodeExecution: false,
      localRelativeExtendsOnly: true,
      pathPatternSupport: "exact-or-single-wildcard",
      note: "Resolution is deterministic and metadata-only. Local tsconfig/jsconfig extends are followed to a depth bound; package-based extends are recorded but not executed or loaded from dependency trees."
    })
  };

  return Object.freeze({ ...payload, digest: canonicalDigest(payload) });
}

async function loadConfig(realRoot, configPath, fileSet, stack, depth) {
  if (depth > MAX_EXTENDS_DEPTH) {
    throw new RepoModuleResolutionError("repo_module_extends_depth_exceeded", `Config extends depth exceeds ${MAX_EXTENDS_DEPTH}: ${configPath}`);
  }
  if (stack.has(configPath)) {
    throw new RepoModuleResolutionError("repo_module_extends_cycle", `Config extends cycle detected at ${configPath}`);
  }
  const nextStack = new Set(stack);
  nextStack.add(configPath);
  const text = await readSnapshotText(realRoot, configPath);
  const parsed = ts.parseConfigFileTextToJson(configPath, text);
  if (parsed.error || !parsed.config || typeof parsed.config !== "object" || Array.isArray(parsed.config)) {
    throw new RepoModuleResolutionError("repo_module_config_invalid", `Invalid TypeScript/JavaScript config: ${configPath}`);
  }
  const raw = parsed.config;
  const configDir = normalizeDirectory(path.posix.dirname(configPath));
  let parent = null;
  let resolvedExtends = null;
  let externalExtends = null;
  if (typeof raw.extends === "string" && raw.extends.trim()) {
    const reference = raw.extends.trim();
    if (reference.startsWith(".")) {
      resolvedExtends = resolveLocalExtends(configDir, reference, fileSet);
      if (!resolvedExtends) {
        throw new RepoModuleResolutionError("repo_module_extends_unresolved", `Local config extends target is not in the repository snapshot: ${reference}`, { configPath });
      }
      parent = await loadConfig(realRoot, resolvedExtends, fileSet, nextStack, depth + 1);
    } else {
      externalExtends = reference;
    }
  }

  const compilerOptions = raw.compilerOptions && typeof raw.compilerOptions === "object" && !Array.isArray(raw.compilerOptions)
    ? raw.compilerOptions
    : {};
  let baseUrl = parent?.baseUrl ?? null;
  if (typeof compilerOptions.baseUrl === "string" && compilerOptions.baseUrl.trim()) {
    baseUrl = Object.freeze({
      raw: compilerOptions.baseUrl.trim(),
      rootRelative: normalizeCandidate(path.posix.join(configDir, compilerOptions.baseUrl.trim())),
      sourceConfig: configPath
    });
  }

  let pathRules = parent?.pathRules ?? Object.freeze([]);
  let unsupportedPathPatterns = parent?.unsupportedPathPatterns ?? 0;
  if (compilerOptions.paths && typeof compilerOptions.paths === "object" && !Array.isArray(compilerOptions.paths)) {
    const rules = [];
    unsupportedPathPatterns = 0;
    const baseDirectory = baseUrl?.rootRelative ?? configDir;
    for (const pattern of Object.keys(compilerOptions.paths).sort()) {
      const targets = compilerOptions.paths[pattern];
      if (!Array.isArray(targets) || targets.some((target) => typeof target !== "string" || !target.trim())) continue;
      if ((pattern.match(/\*/gu) ?? []).length > 1) {
        unsupportedPathPatterns += 1;
        continue;
      }
      rules.push(Object.freeze({
        pattern,
        targets: Object.freeze(targets.map((target) => target.trim())),
        baseDirectory,
        sourceConfig: configPath
      }));
    }
    pathRules = Object.freeze(rules.sort(pathRuleSort));
  }

  return Object.freeze({
    path: configPath,
    directory: configDir,
    resolvedExtends,
    externalExtends,
    baseUrl,
    pathRules,
    unsupportedPathPatterns
  });
}

function resolveEdge(edge, config, workspaceByName, fileSet) {
  if (edge.targetKind === "file" && typeof edge.to === "string") {
    return resolutionRecord(edge, "relative-file", edge.to, null, null, null);
  }
  if (edge.targetKind === "unresolved-relative") {
    return resolutionRecord(edge, "unresolved-relative", null, null, config?.path ?? null, null);
  }

  if (config) {
    for (const rule of config.pathRules) {
      const wildcard = matchPathPattern(rule.pattern, edge.specifier);
      if (wildcard === null) continue;
      for (const target of rule.targets) {
        const substituted = target.replace("*", wildcard);
        const candidate = normalizeCandidate(path.posix.join(rule.baseDirectory, substituted));
        const resolved = resolveFileCandidate(candidate, fileSet);
        if (resolved) return resolutionRecord(edge, "tsconfig-path", resolved, null, rule.sourceConfig, null);
      }
    }

    if (config.baseUrl) {
      const candidate = normalizeCandidate(path.posix.join(config.baseUrl.rootRelative, edge.specifier));
      const resolved = resolveFileCandidate(candidate, fileSet);
      if (resolved) return resolutionRecord(edge, "base-url", resolved, null, config.baseUrl.sourceConfig, null);
    }
  }

  const packageName = packageNameFromSpecifier(edge.specifier);
  const workspace = workspaceByName.get(packageName);
  if (workspace) {
    const targetFile = resolveWorkspaceSpecifier(edge.specifier, workspace, fileSet);
    return resolutionRecord(edge, "workspace-package", targetFile, packageName, config?.path ?? null, workspace.path);
  }

  if (edge.targetKind === "package") {
    return resolutionRecord(edge, "external-package", null, packageName, config?.path ?? null, null);
  }
  return resolutionRecord(edge, "unresolved-alias", null, packageName, config?.path ?? null, null);
}

function resolutionRecord(edge, resolutionKind, targetFile, packageName, configPath, workspaceModulePath) {
  return {
    from: edge.from,
    specifier: edge.specifier,
    importKind: edge.importKind,
    typeOnly: edge.typeOnly,
    resolutionKind,
    targetFile,
    packageName,
    configPath,
    workspaceModulePath
  };
}

async function loadWorkspacePackages(realRoot, packagePaths, fileSet) {
  const items = [];
  for (const packagePath of packagePaths) {
    const text = await readSnapshotText(realRoot, packagePath);
    let metadata;
    try { metadata = JSON.parse(text); } catch {
      throw new RepoModuleResolutionError("repo_module_package_invalid", `Invalid package manifest: ${packagePath}`);
    }
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new RepoModuleResolutionError("repo_module_package_invalid", `Package manifest must contain an object: ${packagePath}`);
    }
    const modulePath = normalizeDirectory(path.posix.dirname(packagePath));
    const name = typeof metadata.name === "string" && metadata.name.trim() ? metadata.name.trim() : null;
    const entryFile = resolvePackageEntry(modulePath, metadata, fileSet);
    items.push(Object.freeze({ name, path: modulePath, packageJson: packagePath, entryFile }));
  }
  return items.sort((a, b) => a.path.localeCompare(b.path));
}

function resolvePackageEntry(modulePath, metadata, fileSet) {
  const candidates = [];
  for (const key of ["types", "typings", "module", "main"]) {
    if (typeof metadata[key] === "string" && metadata[key].trim()) candidates.push(path.posix.join(modulePath, metadata[key].trim()));
  }
  const rootExport = typeof metadata.exports === "string"
    ? metadata.exports
    : metadata.exports && typeof metadata.exports === "object" && typeof metadata.exports["."] === "string"
      ? metadata.exports["."]
      : null;
  if (rootExport) candidates.push(path.posix.join(modulePath, rootExport));
  candidates.push(path.posix.join(modulePath, "src/index"), path.posix.join(modulePath, "index"));
  for (const candidate of candidates) {
    const resolved = resolveFileCandidate(normalizeCandidate(candidate), fileSet);
    if (resolved) return resolved;
  }
  return null;
}

function resolveWorkspaceSpecifier(specifier, workspace, fileSet) {
  const remainder = workspaceRemainder(specifier, workspace.name);
  if (!remainder) return workspace.entryFile;
  const candidate = normalizeCandidate(path.posix.join(workspace.path, remainder));
  return resolveFileCandidate(candidate, fileSet);
}

function nearestConfig(sourcePath, configs) {
  let best = null;
  for (const config of configs) {
    if (!pathContains(config.directory, sourcePath)) continue;
    if (!best || config.directory.length > best.directory.length || (config.directory.length === best.directory.length && config.path.localeCompare(best.path) < 0)) best = config;
  }
  return best;
}

function resolveLocalExtends(configDir, reference, fileSet) {
  const base = normalizeCandidate(path.posix.join(configDir, reference));
  const candidates = path.posix.extname(base) ? [base] : [base, `${base}.json`];
  return candidates.find((candidate) => fileSet.has(candidate)) ?? null;
}

function matchPathPattern(pattern, specifier) {
  const star = pattern.indexOf("*");
  if (star < 0) return pattern === specifier ? "" : null;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix) || specifier.length < prefix.length + suffix.length) return null;
  return specifier.slice(prefix.length, specifier.length - suffix.length);
}

function resolveFileCandidate(base, fileSet) {
  const candidates = [base];
  if (!path.posix.extname(base)) {
    for (const extension of SOURCE_EXTENSIONS) candidates.push(`${base}${extension}`);
    for (const extension of SOURCE_EXTENSIONS) candidates.push(`${base}/index${extension}`);
  }
  return candidates.find((candidate) => fileSet.has(candidate)) ?? null;
}

async function readSnapshotText(realRoot, relativePath) {
  const lexical = path.resolve(realRoot, relativePath);
  if (!isWithin(realRoot, lexical)) throw new RepoModuleResolutionError("repo_module_path_escape", `Snapshot path escapes repository root: ${relativePath}`);
  let stat;
  let physical;
  try {
    stat = await lstat(lexical);
    physical = await realpath(lexical);
  } catch (error) {
    throw new RepoModuleResolutionError("repo_module_file_unreadable", `Snapshot file is no longer readable: ${relativePath}`, { cause: error?.code });
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new RepoModuleResolutionError("repo_module_file_changed", `Snapshot file is no longer a regular non-symlink file: ${relativePath}`);
  if (!isWithin(realRoot, physical)) throw new RepoModuleResolutionError("repo_module_physical_escape", `Snapshot file resolves outside repository root: ${relativePath}`);
  return readFile(physical, "utf8");
}

function publicConfig(config) {
  return Object.freeze({
    path: config.path,
    directory: config.directory,
    resolvedExtends: config.resolvedExtends,
    externalExtends: config.externalExtends,
    baseUrl: config.baseUrl ? Object.freeze({ raw: config.baseUrl.raw, rootRelative: config.baseUrl.rootRelative, sourceConfig: config.baseUrl.sourceConfig }) : null,
    paths: Object.freeze(config.pathRules.map((rule) => Object.freeze({ pattern: rule.pattern, targets: rule.targets, baseDirectory: rule.baseDirectory, sourceConfig: rule.sourceConfig })))
  });
}

function workspaceRemainder(specifier, packageName) {
  if (!packageName || specifier === packageName) return "";
  return specifier.startsWith(`${packageName}/`) ? specifier.slice(packageName.length + 1) : "";
}

function packageNameFromSpecifier(specifier) {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return name ? `${scope}/${name}` : specifier;
  }
  return specifier.split("/")[0];
}

function pathContains(directory, filePath) {
  return directory === "." || filePath === directory || filePath.startsWith(`${directory}/`);
}

function pathRuleSort(a, b) {
  const aExact = a.pattern.includes("*") ? 0 : 1;
  const bExact = b.pattern.includes("*") ? 0 : 1;
  if (aExact !== bExact) return bExact - aExact;
  const aPrefix = a.pattern.split("*")[0].length;
  const bPrefix = b.pattern.split("*")[0].length;
  return bPrefix - aPrefix || a.pattern.localeCompare(b.pattern);
}

function resolutionSort(a, b) {
  return a.from.localeCompare(b.from) || a.specifier.localeCompare(b.specifier) || a.importKind.localeCompare(b.importKind) || a.resolutionKind.localeCompare(b.resolutionKind);
}

function normalizeDirectory(value) {
  const normalized = normalizePath(value);
  return normalized === "" ? "." : normalized;
}

function normalizeCandidate(value) {
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  return normalized.replace(/^\.\//u, "");
}

function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function assertRepoMap(value) {
  if (!value || value.schemaVersion !== "repo-map/v1" || !Array.isArray(value.files) || typeof value.digest !== "string") {
    throw new RepoModuleResolutionError("repo_map_invalid", "Expected repo-map/v1");
  }
}

function assertImportAnalysis(value, repositoryDigest) {
  if (!value || value.schemaVersion !== "repo-import-analysis/v1" || !Array.isArray(value.edges) || typeof value.digest !== "string") {
    throw new RepoModuleResolutionError("repo_import_analysis_invalid", "Expected repo-import-analysis/v1");
  }
  if (value.repositoryDigest !== repositoryDigest) {
    throw new RepoModuleResolutionError("repo_import_analysis_digest_mismatch", "Import analysis does not belong to the supplied RepoMap");
  }
}
