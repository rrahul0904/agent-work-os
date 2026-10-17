import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const REPO_TOPOLOGY_SCHEMA = "repo-topology/v1";

const JS_TS_LANGUAGES = new Set(["JavaScript", "TypeScript"]);
const SOURCE_EXTENSIONS = Object.freeze([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
const PACKAGE_SECTIONS = Object.freeze([
  "dependencies", "devDependencies", "peerDependencies", "optionalDependencies"
]);

export class RepoTopologyError extends Error {
  constructor(code, message, details = {}) {
    super(message ?? code);
    this.name = "RepoTopologyError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export async function analyzeRepositoryTopology(rootPath, repoMap) {
  assertRepoMap(repoMap);
  const absoluteRoot = path.resolve(rootPath);
  const fileSet = new Set(repoMap.files.map((file) => normalizePath(file.path)));

  const packageFiles = repoMap.files
    .filter((file) => path.posix.basename(normalizePath(file.path)) === "package.json")
    .map((file) => normalizePath(file.path))
    .sort();

  const modules = [];
  const packageMetadata = new Map();
  for (const packagePath of packageFiles) {
    const metadata = await readPackageJson(absoluteRoot, packagePath);
    const modulePath = normalizePath(path.posix.dirname(packagePath));
    const normalizedModulePath = modulePath === "." ? "." : modulePath;
    const module = Object.freeze({
      id: moduleId(normalizedModulePath),
      kind: "module",
      name: metadata.name ?? (normalizedModulePath === "." ? repoMap.root.name : path.posix.basename(normalizedModulePath)),
      path: normalizedModulePath,
      private: metadata.private === true
    });
    modules.push(module);
    packageMetadata.set(module.id, Object.freeze({
      dependencies: Object.freeze(collectDependencies(metadata))
    }));
  }

  if (modules.length === 0) {
    modules.push(Object.freeze({
      id: moduleId("."),
      kind: "module",
      name: repoMap.root.name,
      path: ".",
      private: true
    }));
    packageMetadata.set(moduleId("."), Object.freeze({ dependencies: Object.freeze([]) }));
  }

  modules.sort((a, b) => a.path.localeCompare(b.path));
  const moduleByName = new Map(modules.map((module) => [module.name, module]));
  const moduleEdges = [];
  const externalPackages = new Map();

  for (const module of modules) {
    const metadata = packageMetadata.get(module.id);
    for (const dependency of metadata?.dependencies ?? []) {
      const internal = moduleByName.get(dependency.name);
      if (internal && internal.id !== module.id) {
        moduleEdges.push(Object.freeze({
          kind: "workspace-dependency",
          from: module.id,
          to: internal.id,
          dependencyType: dependency.type
        }));
      } else {
        externalPackages.set(dependency.name, Object.freeze({
          id: externalId(dependency.name),
          kind: "external-package",
          name: dependency.name,
          ecosystem: "npm"
        }));
        moduleEdges.push(Object.freeze({
          kind: "external-dependency",
          from: module.id,
          to: externalId(dependency.name),
          dependencyType: dependency.type
        }));
      }
    }
  }

  const sourceFiles = repoMap.files
    .filter((file) => JS_TS_LANGUAGES.has(file.language))
    .map((file) => normalizePath(file.path))
    .sort();
  const fileImports = [];
  const crossModulePairs = new Set();

  for (const sourcePath of sourceFiles) {
    const source = await readFile(path.join(absoluteRoot, sourcePath), "utf8");
    const specifiers = extractJsTsSpecifiers(source);
    const sourceModule = owningModule(sourcePath, modules);

    for (const specifier of specifiers) {
      if (specifier.startsWith(".") || specifier.startsWith("/")) {
        const resolved = resolveRelativeImport(sourcePath, specifier, fileSet);
        if (!resolved) continue;
        const targetModule = owningModule(resolved, modules);
        fileImports.push(Object.freeze({
          kind: "file-import",
          from: sourcePath,
          to: resolved,
          boundary: sourceModule?.id !== targetModule?.id ? "cross-module" : "intra-module"
        }));
        if (sourceModule && targetModule && sourceModule.id !== targetModule.id) {
          crossModulePairs.add(`${sourceModule.id}\u0000${targetModule.id}`);
        }
        continue;
      }

      const packageName = packageNameFromSpecifier(specifier);
      const internal = moduleByName.get(packageName);
      if (internal) {
        if (sourceModule && sourceModule.id !== internal.id) {
          crossModulePairs.add(`${sourceModule.id}\u0000${internal.id}`);
        }
        continue;
      }
      externalPackages.set(packageName, Object.freeze({
        id: externalId(packageName),
        kind: "external-package",
        name: packageName,
        ecosystem: "npm"
      }));
    }
  }

  for (const pair of [...crossModulePairs].sort()) {
    const [from, to] = pair.split("\u0000");
    if (!moduleEdges.some((edge) => edge.from === from && edge.to === to && edge.kind === "workspace-dependency")) {
      moduleEdges.push(Object.freeze({
        kind: "observed-import",
        from,
        to,
        dependencyType: "source-import"
      }));
    }
  }

  const sortedModuleEdges = dedupeEdges(moduleEdges).sort(edgeSort);
  const sortedFileImports = dedupeFileImports(fileImports).sort((a, b) =>
    a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.boundary.localeCompare(b.boundary)
  );
  const externalNodes = [...externalPackages.values()].sort((a, b) => a.name.localeCompare(b.name));
  const centrality = computeModuleCentrality(modules, sortedModuleEdges);

  const payload = {
    schemaVersion: REPO_TOPOLOGY_SCHEMA,
    repositoryDigest: repoMap.digest,
    modules: Object.freeze(modules),
    externalPackages: Object.freeze(externalNodes),
    moduleEdges: Object.freeze(sortedModuleEdges),
    fileImports: Object.freeze(sortedFileImports),
    centrality: Object.freeze(centrality),
    metrics: Object.freeze({
      modules: modules.length,
      externalPackages: externalNodes.length,
      moduleEdges: sortedModuleEdges.length,
      fileImports: sortedFileImports.length,
      crossModuleImports: sortedFileImports.filter((edge) => edge.boundary === "cross-module").length
    })
  };

  return Object.freeze({ ...payload, digest: canonicalDigest(payload) });
}

function collectDependencies(metadata) {
  const byName = new Map();
  for (const section of PACKAGE_SECTIONS) {
    const dependencies = metadata?.[section];
    if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) continue;
    for (const name of Object.keys(dependencies).sort()) {
      if (!byName.has(name)) byName.set(name, Object.freeze({ name, type: section }));
    }
  }
  return [...byName.values()];
}

async function readPackageJson(root, relativePath) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
  } catch (error) {
    throw new RepoTopologyError("repo_package_json_invalid", `Invalid package manifest: ${relativePath}`, {
      path: relativePath,
      cause: error?.message ?? String(error)
    });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RepoTopologyError("repo_package_json_invalid", `Package manifest must contain an object: ${relativePath}`);
  }
  return parsed;
}

function extractJsTsSpecifiers(source) {
  const values = new Set();
  const patterns = [
    /(?:import|export)\s+(?:[^"']*?\sfrom\s*)?["']([^"']+)["']/gu,
    /import\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /require\s*\(\s*["']([^"']+)["']\s*\)/gu
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) values.add(match[1]);
  }
  return [...values].sort();
}

function resolveRelativeImport(sourcePath, specifier, fileSet) {
  const sourceDir = path.posix.dirname(sourcePath);
  const base = normalizePath(path.posix.normalize(path.posix.join(sourceDir, specifier)));
  const candidates = [base];
  if (!path.posix.extname(base)) {
    for (const extension of SOURCE_EXTENSIONS) candidates.push(`${base}${extension}`);
    for (const extension of SOURCE_EXTENSIONS) candidates.push(`${base}/index${extension}`);
  }
  return candidates.find((candidate) => fileSet.has(candidate)) ?? null;
}

function owningModule(filePath, modules) {
  let best = null;
  for (const module of modules) {
    if (module.path === ".") {
      if (!best) best = module;
      continue;
    }
    if (filePath === module.path || filePath.startsWith(`${module.path}/`)) {
      if (!best || module.path.length > best.path.length) best = module;
    }
  }
  return best;
}

function packageNameFromSpecifier(specifier) {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return name ? `${scope}/${name}` : specifier;
  }
  return specifier.split("/")[0];
}

function moduleId(modulePath) {
  return `module:${modulePath}`;
}

function externalId(name) {
  return `npm:${name}`;
}

function computeModuleCentrality(modules, edges) {
  const stats = new Map(modules.map((module) => [module.id, { incoming: 0, outgoing: 0 }]));
  for (const edge of edges) {
    if (stats.has(edge.from)) stats.get(edge.from).outgoing += 1;
    if (stats.has(edge.to)) stats.get(edge.to).incoming += 1;
  }
  return modules.map((module) => {
    const value = stats.get(module.id);
    return Object.freeze({
      moduleId: module.id,
      incoming: value.incoming,
      outgoing: value.outgoing,
      degree: value.incoming + value.outgoing
    });
  }).sort((a, b) => b.degree - a.degree || a.moduleId.localeCompare(b.moduleId));
}

function dedupeEdges(edges) {
  const seen = new Set();
  const output = [];
  for (const edge of edges) {
    const key = `${edge.kind}\u0000${edge.from}\u0000${edge.to}\u0000${edge.dependencyType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(edge);
  }
  return output;
}

function dedupeFileImports(edges) {
  const seen = new Set();
  const output = [];
  for (const edge of edges) {
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.boundary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(edge);
  }
  return output;
}

function edgeSort(a, b) {
  return a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind) || a.dependencyType.localeCompare(b.dependencyType);
}

function normalizePath(value) {
  const normalized = value.replaceAll("\\", "/");
  return normalized === "" ? "." : normalized;
}

function assertRepoMap(value) {
  if (!value || value.schemaVersion !== "repo-map/v1" || !Array.isArray(value.files) || typeof value.digest !== "string") {
    throw new RepoTopologyError("repo_map_invalid", "Expected a repo-map/v1 value");
  }
}

function canonicalDigest(value) {
  return `sha256:${createHash("sha256").update(canonicalStringify(value)).digest("hex")}`;
}

function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
