import { createHash } from "node:crypto";
import { lstat, opendir, readFile } from "node:fs/promises";
import path from "node:path";

export const REPO_MAP_SCHEMA = "repo-map/v1";
export const REPO_CONTEXT_EVIDENCE_SCHEMA = "repo-context-evidence/v1";

export const DEFAULT_SCAN_LIMITS = Object.freeze({
  maxDepth: 50,
  maxDirectories: 20_000,
  maxFiles: 100_000,
  maxFileBytes: 50 * 1024 * 1024
});

export const DEFAULT_EXCLUDED_DIRECTORIES = Object.freeze(new Set([
  ".git", ".hg", ".svn", ".idea", ".vscode", ".gradle", ".next", ".nuxt",
  ".svelte-kit", ".terraform", "__pycache__", ".venv", "venv", ".tox", ".nox",
  "bower_components", "build", "coverage", "dist", "node_modules", "obj", "out",
  "target", "vendor"
]));

const EXTENSION_LANGUAGE = Object.freeze({
  ".go": "Go", ".java": "Java", ".kt": "Kotlin", ".kts": "Kotlin",
  ".js": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript", ".jsx": "JavaScript",
  ".ts": "TypeScript", ".mts": "TypeScript", ".cts": "TypeScript", ".tsx": "TypeScript",
  ".py": "Python", ".pyw": "Python", ".rs": "Rust", ".c": "C", ".h": "C/C++",
  ".cc": "C++", ".cpp": "C++", ".cxx": "C++", ".hh": "C++", ".hpp": "C++",
  ".hxx": "C++", ".cs": "C#", ".swift": "Swift", ".m": "Objective-C",
  ".mm": "Objective-C++", ".rb": "Ruby", ".php": "PHP", ".dart": "Dart",
  ".scala": "Scala", ".sc": "Scala", ".sh": "Shell", ".bash": "Shell",
  ".zsh": "Shell", ".fish": "Shell", ".sql": "SQL", ".html": "HTML",
  ".htm": "HTML", ".css": "CSS", ".scss": "SCSS", ".sass": "Sass",
  ".vue": "Vue", ".svelte": "Svelte", ".md": "Markdown", ".markdown": "Markdown",
  ".mdx": "Markdown", ".lua": "Lua", ".r": "R", ".pl": "Perl", ".pm": "Perl",
  ".ex": "Elixir", ".exs": "Elixir", ".erl": "Erlang", ".hrl": "Erlang",
  ".hs": "Haskell", ".lhs": "Haskell", ".clj": "Clojure", ".cljs": "ClojureScript",
  ".groovy": "Groovy", ".gradle": "Groovy", ".fs": "F#", ".fsx": "F#",
  ".vb": "Visual Basic", ".zig": "Zig", ".sol": "Solidity", ".tf": "Terraform",
  ".proto": "Protocol Buffers", ".yaml": "YAML", ".yml": "YAML", ".json": "JSON"
});

const TASK_STOPWORDS = new Set([
  "a", "an", "and", "add", "build", "change", "create", "fix", "for", "from", "in", "into",
  "of", "on", "or", "the", "to", "update", "with", "without"
]);

export class RepoScanError extends Error {
  constructor(code, message, details = {}) {
    super(message ?? code);
    this.name = "RepoScanError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export async function scanRepository(rootPath, options = {}) {
  const limits = normalizeLimits(options.limits);
  const excludedDirectories = new Set([
    ...DEFAULT_EXCLUDED_DIRECTORIES,
    ...(options.excludedDirectories ?? [])
  ]);
  const absoluteRoot = path.resolve(rootPath);
  const rootInfo = await safeLstat(absoluteRoot, "repo_root_unreadable");
  if (rootInfo.isSymbolicLink()) {
    throw new RepoScanError("repo_root_symlink_forbidden", `Repository root cannot be a symlink: ${absoluteRoot}`);
  }
  if (!rootInfo.isDirectory()) {
    throw new RepoScanError("repo_root_not_directory", `Repository root is not a directory: ${absoluteRoot}`);
  }

  const state = {
    limits,
    excludedDirectories,
    directoryCount: 0,
    fileCount: 0,
    files: [],
    exclusions: {
      defaultDirectory: 0,
      ignoreRule: 0,
      symlink: 0,
      unrecognized: 0,
      binary: 0
    }
  };

  const tree = await scanDirectory(absoluteRoot, ".", 0, [], state);
  if (tree.lines === 0) {
    throw new RepoScanError("repo_no_recognized_source", `No recognized nonblank source lines found in ${absoluteRoot}`);
  }

  const languages = aggregateLanguages(state.files);
  const payload = {
    schemaVersion: REPO_MAP_SCHEMA,
    root: Object.freeze({ name: path.basename(absoluteRoot) || "root", path: "." }),
    metrics: Object.freeze({
      lines: tree.lines,
      files: state.files.length,
      directories: state.directoryCount,
      estimatedTokens: state.files.reduce((sum, file) => sum + file.estimatedTokens, 0)
    }),
    languages,
    files: Object.freeze(state.files
      .slice()
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((file) => Object.freeze({ ...file }))),
    tree,
    exclusions: Object.freeze({ ...state.exclusions })
  };

  return Object.freeze({ ...payload, digest: canonicalDigest(payload) });
}

export function selectRepositoryContext(repoMap, input = {}) {
  assertRepoMap(repoMap);
  const task = requireText(input.task, "repo_context_task_invalid", 20_000);
  const maxFiles = normalizePositiveInteger(input.maxFiles ?? 24, "repo_context_max_files_invalid", 1, 500);
  const maxEstimatedTokens = normalizePositiveInteger(
    input.maxEstimatedTokens ?? 24_000,
    "repo_context_token_budget_invalid",
    1,
    2_000_000
  );
  const tokens = tokenizeTask(task);

  const ranked = repoMap.files
    .map((file) => ({ ...file, relevance: scoreFile(file, tokens) }))
    .sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;
      if (a.estimatedTokens !== b.estimatedTokens) return a.estimatedTokens - b.estimatedTokens;
      return a.path.localeCompare(b.path);
    });

  const selected = [];
  let tokenTotal = 0;
  for (const file of ranked) {
    if (selected.length >= maxFiles) break;
    if (tokenTotal + file.estimatedTokens > maxEstimatedTokens) continue;
    selected.push(Object.freeze({
      path: file.path,
      language: file.language,
      lines: file.lines,
      estimatedTokens: file.estimatedTokens,
      relevance: Number(file.relevance.toFixed(6))
    }));
    tokenTotal += file.estimatedTokens;
  }

  const evidence = {
    schemaVersion: REPO_CONTEXT_EVIDENCE_SCHEMA,
    repositoryDigest: repoMap.digest,
    task,
    taskTokens: Object.freeze(tokens),
    selected: Object.freeze(selected),
    estimatedTokens: tokenTotal,
    budget: Object.freeze({ maxFiles, maxEstimatedTokens }),
    omittedByBudget: Math.max(0, ranked.length - selected.length)
  };

  return Object.freeze({ ...evidence, digest: canonicalDigest(evidence) });
}

export function canonicalDigest(value) {
  return `sha256:${createHash("sha256").update(canonicalStringify(value)).digest("hex")}`;
}

async function scanDirectory(absoluteDir, relativeDir, depth, inheritedRules, state) {
  if (depth > state.limits.maxDepth) {
    throw new RepoScanError("repo_depth_limit_exceeded", `Repository depth limit exceeded at ${relativeDir}`, {
      limit: state.limits.maxDepth,
      path: relativeDir
    });
  }
  state.directoryCount += 1;
  if (state.directoryCount > state.limits.maxDirectories) {
    throw new RepoScanError("repo_directory_limit_exceeded", `Repository directory limit exceeded at ${relativeDir}`, {
      limit: state.limits.maxDirectories,
      path: relativeDir
    });
  }

  const localRules = await loadLocalIgnoreRules(absoluteDir, relativeDir);
  const rules = [...inheritedRules, ...localRules];
  const dir = await opendir(absoluteDir);
  const entries = [];
  for await (const entry of dir) entries.push(entry);
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const node = {
    name: relativeDir === "." ? path.basename(absoluteDir) || "root" : path.basename(absoluteDir),
    path: relativeDir,
    lines: 0,
    files: 0,
    directLines: 0,
    directFiles: 0,
    languages: {},
    directLanguages: {},
    topFiles: [],
    children: []
  };

  for (const entry of entries) {
    if (entry.name === ".gitignore" || entry.name === ".repoatlasignore") continue;
    const absoluteChild = path.join(absoluteDir, entry.name);
    const relativeChild = relativeDir === "." ? entry.name : `${relativeDir}/${entry.name}`;

    if (entry.isSymbolicLink()) {
      state.exclusions.symlink += 1;
      continue;
    }

    if (entry.isDirectory()) {
      if (state.excludedDirectories.has(entry.name)) {
        state.exclusions.defaultDirectory += 1;
        continue;
      }
      if (isIgnored(relativeChild, true, rules)) {
        state.exclusions.ignoreRule += 1;
        continue;
      }
      const child = await scanDirectory(absoluteChild, relativeChild, depth + 1, rules, state);
      mergeChild(node, child);
      if (child.lines > 0) node.children.push(child);
      continue;
    }

    if (!entry.isFile()) continue;
    if (isIgnored(relativeChild, false, rules)) {
      state.exclusions.ignoreRule += 1;
      continue;
    }

    const language = EXTENSION_LANGUAGE[path.extname(entry.name).toLowerCase()];
    if (!language) {
      state.exclusions.unrecognized += 1;
      continue;
    }
    state.fileCount += 1;
    if (state.fileCount > state.limits.maxFiles) {
      throw new RepoScanError("repo_file_limit_exceeded", `Repository file limit exceeded at ${relativeChild}`, {
        limit: state.limits.maxFiles,
        path: relativeChild
      });
    }

    const info = await safeLstat(absoluteChild, "repo_file_unreadable");
    if (!info.isFile()) continue;
    if (info.size > state.limits.maxFileBytes) {
      throw new RepoScanError("repo_file_size_limit_exceeded", `Source file exceeds size limit: ${relativeChild}`, {
        limit: state.limits.maxFileBytes,
        size: info.size,
        path: relativeChild
      });
    }

    const source = await readFile(absoluteChild);
    if (source.includes(0)) {
      state.exclusions.binary += 1;
      continue;
    }
    const text = source.toString("utf8");
    const lines = countNonblankLines(text);
    const file = Object.freeze({
      path: relativeChild,
      language,
      lines,
      bytes: info.size,
      estimatedTokens: Math.max(1, Math.ceil(info.size / 4))
    });
    state.files.push(file);
    node.directLines += lines;
    node.directFiles += 1;
    addLanguage(node.directLanguages, language, lines, 1);
    addLanguage(node.languages, language, lines, 1);
    node.topFiles.push({ name: entry.name, path: relativeChild, lines });
  }

  node.lines += node.directLines;
  node.files += node.directFiles;
  node.children.sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name));
  node.topFiles.sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name));
  node.topFiles = node.topFiles.slice(0, 50).map((file) => Object.freeze(file));
  node.children = node.children.map((child) => Object.freeze(child));
  node.languages = Object.freeze(sortObject(node.languages));
  node.directLanguages = Object.freeze(sortObject(node.directLanguages));
  return Object.freeze(node);
}

function mergeChild(parent, child) {
  parent.lines += child.lines;
  parent.files += child.files;
  for (const [language, stats] of Object.entries(child.languages)) {
    addLanguage(parent.languages, language, stats.lines, stats.files);
  }
}

function addLanguage(target, language, lines, files) {
  const current = target[language] ?? { lines: 0, files: 0 };
  target[language] = { lines: current.lines + lines, files: current.files + files };
}

function aggregateLanguages(files) {
  const totals = {};
  for (const file of files) addLanguage(totals, file.language, file.lines, 1);
  return Object.freeze(sortObject(totals));
}

async function loadLocalIgnoreRules(absoluteDir, relativeDir) {
  const rules = [];
  for (const filename of [".gitignore", ".repoatlasignore"]) {
    const filepath = path.join(absoluteDir, filename);
    try {
      const text = await readFile(filepath, "utf8");
      for (const rawLine of text.split(/\r?\n/u)) {
        const rule = compileIgnoreRule(rawLine, relativeDir, filename);
        if (rule) rules.push(rule);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return rules;
}

function compileIgnoreRule(rawLine, basePath, source) {
  let line = rawLine.trim();
  if (!line || line.startsWith("#")) return null;
  let negated = false;
  if (line.startsWith("!")) {
    negated = true;
    line = line.slice(1);
  }
  if (!line) return null;
  const directoryOnly = line.endsWith("/");
  if (directoryOnly) line = line.slice(0, -1);
  const anchored = line.startsWith("/");
  if (anchored) line = line.slice(1);
  if (!line) return null;

  const hasSlash = line.includes("/");
  const body = globToRegex(line);
  const expression = anchored || hasSlash
    ? `^${body}(?:/.*)?$`
    : `(?:^|/)${body}(?:/.*)?$`;
  return Object.freeze({
    source,
    basePath,
    negated,
    directoryOnly,
    regex: new RegExp(expression, "u")
  });
}

function isIgnored(relativePath, isDirectory, rules) {
  let ignored = false;
  for (const rule of rules) {
    if (rule.directoryOnly && !isDirectory) continue;
    const base = rule.basePath === "." ? "" : `${rule.basePath}/`;
    if (base && !relativePath.startsWith(base)) continue;
    const localPath = base ? relativePath.slice(base.length) : relativePath;
    if (rule.regex.test(localPath)) ignored = !rule.negated;
  }
  return ignored;
}

function globToRegex(value) {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "*") {
      if (value[index + 1] === "*") {
        output += ".*";
        index += 1;
      } else {
        output += "[^/]*";
      }
    } else if (char === "?") {
      output += "[^/]";
    } else {
      output += /[|\\{}()[\]^$+?.-]/u.test(char) ? `\\${char}` : char;
    }
  }
  return output;
}

function countNonblankLines(text) {
  if (!text) return 0;
  let count = 0;
  for (const line of text.split(/\r?\n/u)) {
    if (/\S/u.test(line)) count += 1;
  }
  return count;
}

function tokenizeTask(task) {
  return [...new Set(task
    .toLowerCase()
    .split(/[^a-z0-9_+#.-]+/u)
    .map((token) => token.replace(/^[-_.]+|[-_.]+$/gu, ""))
    .filter((token) => token.length >= 2 && !TASK_STOPWORDS.has(token)))]
    .sort();
}

function scoreFile(file, taskTokens) {
  if (taskTokens.length === 0) return 0;
  const normalizedPath = file.path.toLowerCase();
  const basename = path.basename(normalizedPath, path.extname(normalizedPath));
  const segments = new Set(normalizedPath.split(/[\\/_.-]+/u).filter(Boolean));
  const language = file.language.toLowerCase();
  let score = 0;
  for (const token of taskTokens) {
    if (basename === token) score += 8;
    if (segments.has(token)) score += 5;
    if (normalizedPath.includes(token)) score += 2;
    if (language.includes(token)) score += 1;
  }
  const depth = normalizedPath.split("/").length;
  return score + (score > 0 ? 1 / Math.max(1, depth) : 0);
}

function normalizeLimits(value = {}) {
  const limits = { ...DEFAULT_SCAN_LIMITS, ...(value ?? {}) };
  return Object.freeze({
    maxDepth: normalizePositiveInteger(limits.maxDepth, "repo_limit_depth_invalid", 1, 500),
    maxDirectories: normalizePositiveInteger(limits.maxDirectories, "repo_limit_directories_invalid", 1, 1_000_000),
    maxFiles: normalizePositiveInteger(limits.maxFiles, "repo_limit_files_invalid", 1, 5_000_000),
    maxFileBytes: normalizePositiveInteger(limits.maxFileBytes, "repo_limit_file_bytes_invalid", 1, 1024 * 1024 * 1024)
  });
}

function normalizePositiveInteger(value, code, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RepoScanError(code, code);
  return value;
}

function assertRepoMap(value) {
  if (!value || value.schemaVersion !== REPO_MAP_SCHEMA || !Array.isArray(value.files) || typeof value.digest !== "string") {
    throw new RepoScanError("repo_map_invalid", "Expected a repo-map/v1 value");
  }
}

function requireText(value, code, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new RepoScanError(code, code);
  return value.trim();
}

async function safeLstat(filepath, code) {
  try {
    return await lstat(filepath);
  } catch (error) {
    throw new RepoScanError(code, `${code}: ${filepath}`, { cause: error?.code ?? "unknown", path: filepath });
  }
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
