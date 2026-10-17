import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import ts from "@typescript/typescript6";

import { canonicalDigest } from "./index.js";

export const REPO_IMPORT_ANALYSIS_SCHEMA = "repo-import-analysis/v1";

const JS_TS_LANGUAGES = new Set(["JavaScript", "TypeScript"]);
const SOURCE_EXTENSIONS = Object.freeze([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
const IMPORT_KINDS = Object.freeze([
  "static-import",
  "type-import",
  "export-from",
  "type-export-from",
  "dynamic-import",
  "require",
  "import-equals"
]);

export class RepoImportAnalysisError extends Error {
  constructor(code, message, details = {}) {
    super(message ?? code);
    this.name = "RepoImportAnalysisError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export async function analyzeRepositoryImports(rootPath, repoMap) {
  assertRepoMap(repoMap);
  const realRoot = await realpath(path.resolve(rootPath));
  const fileSet = new Set(repoMap.files.map((file) => normalizePath(file.path)));
  const sourceFiles = repoMap.files
    .filter((file) => JS_TS_LANGUAGES.has(file.language))
    .map((file) => normalizePath(file.path))
    .sort();

  const files = [];
  const edges = [];
  let parserFiles = 0;
  let fallbackFiles = 0;
  let parseDiagnostics = 0;
  let nonLiteralDynamicImports = 0;

  for (const relativePath of sourceFiles) {
    const source = await readSnapshotFile(realRoot, relativePath);
    const parsed = parseSource(relativePath, source);
    parseDiagnostics += parsed.diagnosticCount;
    nonLiteralDynamicImports += parsed.nonLiteralDynamicImports;
    if (parsed.mode === "parser") parserFiles += 1;
    else fallbackFiles += 1;

    const fileEdges = parsed.imports.map((item) => Object.freeze({
      from: relativePath,
      specifier: item.specifier,
      importKind: item.importKind,
      typeOnly: item.typeOnly,
      ...resolveTarget(relativePath, item.specifier, fileSet)
    })).sort(edgeSort);

    edges.push(...fileEdges);
    files.push(Object.freeze({
      path: relativePath,
      parseMode: parsed.mode,
      diagnosticCount: parsed.diagnosticCount,
      importCount: fileEdges.length,
      nonLiteralDynamicImports: parsed.nonLiteralDynamicImports
    }));
  }

  const dedupedEdges = dedupeEdges(edges).sort(edgeSort);
  const importsByKind = Object.fromEntries(IMPORT_KINDS.map((kind) => [
    kind,
    dedupedEdges.filter((edge) => edge.importKind === kind).length
  ]));

  const payload = {
    schemaVersion: REPO_IMPORT_ANALYSIS_SCHEMA,
    repositoryDigest: repoMap.digest,
    parser: Object.freeze({
      engine: "typescript-compiler-api",
      package: "@typescript/typescript6",
      version: ts.version
    }),
    files: Object.freeze(files),
    edges: Object.freeze(dedupedEdges),
    metrics: Object.freeze({
      sourceFiles: sourceFiles.length,
      parserFiles,
      fallbackFiles,
      parseDiagnostics,
      edges: dedupedEdges.length,
      resolvedFiles: dedupedEdges.filter((edge) => edge.targetKind === "file").length,
      packageReferences: dedupedEdges.filter((edge) => edge.targetKind === "package").length,
      unresolvedRelative: dedupedEdges.filter((edge) => edge.targetKind === "unresolved-relative").length,
      typeOnlyImports: dedupedEdges.filter((edge) => edge.typeOnly).length,
      nonLiteralDynamicImports,
      importsByKind: Object.freeze(importsByKind)
    })
  };

  return Object.freeze({ ...payload, digest: canonicalDigest(payload) });
}

function parseSource(filePath, source) {
  try {
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(filePath)
    );
    const diagnostics = Array.isArray(sourceFile.parseDiagnostics) ? sourceFile.parseDiagnostics : [];
    const diagnosticCount = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error).length;
    if (diagnosticCount > 0) {
      const fallback = extractLexicalImports(source);
      return Object.freeze({
        mode: "lexical-fallback",
        diagnosticCount,
        imports: fallback.imports,
        nonLiteralDynamicImports: fallback.nonLiteralDynamicImports
      });
    }

    const imports = [];
    let nonLiteralDynamicImports = 0;
    const visit = (node) => {
      if (ts.isImportDeclaration(node) && isStaticString(node.moduleSpecifier)) {
        const typeOnly = isTypeOnlyImport(node.importClause);
        imports.push(importRecord(node.moduleSpecifier.text, typeOnly ? "type-import" : "static-import", typeOnly));
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && isStaticString(node.moduleSpecifier)) {
        const typeOnly = node.isTypeOnly === true;
        imports.push(importRecord(node.moduleSpecifier.text, typeOnly ? "type-export-from" : "export-from", typeOnly));
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        const expression = node.moduleReference.expression;
        if (expression && isStaticString(expression)) imports.push(importRecord(expression.text, "import-equals", false));
      } else if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const argument = node.arguments[0];
          if (argument && isStaticString(argument)) imports.push(importRecord(argument.text, "dynamic-import", false));
          else nonLiteralDynamicImports += 1;
        } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
          const argument = node.arguments[0];
          if (argument && isStaticString(argument)) imports.push(importRecord(argument.text, "require", false));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    return Object.freeze({
      mode: "parser",
      diagnosticCount,
      imports: Object.freeze(imports),
      nonLiteralDynamicImports
    });
  } catch {
    const fallback = extractLexicalImports(source);
    return Object.freeze({
      mode: "lexical-fallback",
      diagnosticCount: 1,
      imports: fallback.imports,
      nonLiteralDynamicImports: fallback.nonLiteralDynamicImports
    });
  }
}

function isTypeOnlyImport(importClause) {
  if (!importClause) return false;
  if (importClause.isTypeOnly === true) return true;
  if (importClause.name) return false;
  const bindings = importClause.namedBindings;
  return Boolean(bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly === true));
}

function extractLexicalImports(source) {
  const imports = [];
  const patterns = [
    { kind: "type-import", typeOnly: true, pattern: /\bimport\s+type\b[^"']*?\bfrom\s*["']([^"']+)["']/gu },
    { kind: "static-import", typeOnly: false, pattern: /\bimport\s+(?!type\b)(?:[^"']*?\bfrom\s*)?["']([^"']+)["']/gu },
    { kind: "type-export-from", typeOnly: true, pattern: /\bexport\s+type\b[^"']*?\bfrom\s*["']([^"']+)["']/gu },
    { kind: "export-from", typeOnly: false, pattern: /\bexport\s+(?!type\b)[^"']*?\bfrom\s*["']([^"']+)["']/gu },
    { kind: "dynamic-import", typeOnly: false, pattern: /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu },
    { kind: "require", typeOnly: false, pattern: /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu }
  ];
  for (const { kind, typeOnly, pattern } of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) imports.push(importRecord(match[1], kind, typeOnly));
  }
  const dynamicTotal = [...source.matchAll(/\bimport\s*\(/gu)].length;
  const literalDynamic = imports.filter((item) => item.importKind === "dynamic-import").length;
  return Object.freeze({
    imports: Object.freeze(imports),
    nonLiteralDynamicImports: Math.max(0, dynamicTotal - literalDynamic)
  });
}

function resolveTarget(sourcePath, specifier, fileSet) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const resolved = resolveRelativeImport(sourcePath, specifier, fileSet);
    return resolved
      ? { targetKind: "file", to: resolved }
      : { targetKind: "unresolved-relative", to: null };
  }
  return { targetKind: "package", to: packageNameFromSpecifier(specifier) };
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

async function readSnapshotFile(realRoot, relativePath) {
  const lexical = path.resolve(realRoot, relativePath);
  if (!isWithin(realRoot, lexical)) {
    throw new RepoImportAnalysisError("repo_import_path_escape", `RepoMap path escapes repository root: ${relativePath}`);
  }
  let stat;
  let physical;
  try {
    stat = await lstat(lexical);
    physical = await realpath(lexical);
  } catch (error) {
    throw new RepoImportAnalysisError("repo_import_file_unreadable", `RepoMap file is no longer readable: ${relativePath}`, { cause: error?.code });
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new RepoImportAnalysisError("repo_import_file_changed", `RepoMap file is no longer a regular non-symlink file: ${relativePath}`);
  }
  if (!isWithin(realRoot, physical)) {
    throw new RepoImportAnalysisError("repo_import_physical_escape", `RepoMap file resolves outside repository root: ${relativePath}`);
  }
  return readFile(physical, "utf8");
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function scriptKind(filePath) {
  switch (path.posix.extname(filePath).toLowerCase()) {
    case ".jsx": return ts.ScriptKind.JSX;
    case ".tsx": return ts.ScriptKind.TSX;
    case ".js": case ".mjs": case ".cjs": return ts.ScriptKind.JS;
    default: return ts.ScriptKind.TS;
  }
}

function isStaticString(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function importRecord(specifier, importKind, typeOnly) {
  return Object.freeze({ specifier, importKind, typeOnly });
}

function packageNameFromSpecifier(specifier) {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return name ? `${scope}/${name}` : specifier;
  }
  return specifier.split("/")[0];
}

function dedupeEdges(edges) {
  const seen = new Set();
  const output = [];
  for (const edge of edges) {
    const key = `${edge.from}\u0000${edge.specifier}\u0000${edge.importKind}\u0000${edge.typeOnly}\u0000${edge.targetKind}\u0000${edge.to ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(edge);
  }
  return output;
}

function edgeSort(a, b) {
  return a.from.localeCompare(b.from)
    || a.specifier.localeCompare(b.specifier)
    || a.importKind.localeCompare(b.importKind)
    || String(a.to ?? "").localeCompare(String(b.to ?? ""));
}

function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function assertRepoMap(value) {
  if (!value || value.schemaVersion !== "repo-map/v1" || !Array.isArray(value.files) || typeof value.digest !== "string") {
    throw new RepoImportAnalysisError("repo_map_invalid", "Expected repo-map/v1");
  }
}
