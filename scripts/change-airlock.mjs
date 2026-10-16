#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { analyzeUnifiedDiff } from "../packages/change-airlock/src/index.js";

const execFileAsync = promisify(execFile);

const args = parseArgs(process.argv.slice(2));
const policy = args.policy ? JSON.parse(await fs.readFile(path.resolve(args.policy), "utf8")) : {};

let diffText;
let baseSha = null;
let headSha = null;
let baseRef = args.base ?? null;
let headRef = args.head ?? null;

if (args.diffFile) {
  diffText = await fs.readFile(path.resolve(args.diffFile), "utf8");
} else {
  baseRef ??= process.env.CHANGE_AIRLOCK_BASE_REF || "HEAD^";
  headRef ??= process.env.CHANGE_AIRLOCK_HEAD_REF || "HEAD";
  baseSha = await gitRevParse(baseRef);
  headSha = await gitRevParse(headRef);
  diffText = await gitDiff(baseRef, headRef);
}

const report = {
  generatedAt: new Date().toISOString(),
  baseRef,
  headRef,
  ...analyzeUnifiedDiff(diffText, { policy, baseSha, headSha })
};

const json = `${JSON.stringify(report, null, 2)}\n`;
if (args.output) await fs.writeFile(path.resolve(args.output), json, { mode: 0o600 });
process.stdout.write(json);
process.exit(report.decision === "PASS" ? 0 : 1);

async function gitRevParse(ref) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--verify", ref], { maxBuffer: 1024 * 1024 });
    const sha = stdout.trim();
    if (!/^[a-f0-9]{40,64}$/i.test(sha)) throw new Error("invalid_sha");
    return sha;
  } catch (error) {
    console.error(`change-airlock: cannot resolve git ref ${ref}: ${error.message}`);
    process.exit(2);
  }
}

async function gitDiff(base, head) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--no-ext-diff", "--unified=0", `${base}...${head}`, "--"],
      { maxBuffer: 64 * 1024 * 1024 }
    );
    return stdout;
  } catch (error) {
    console.error(`change-airlock: git diff failed: ${error.message}`);
    process.exit(2);
  }
}

function parseArgs(argv) {
  const result = { base: null, head: null, diffFile: null, policy: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (["--base", "--head", "--diff-file", "--policy", "--output"].includes(value)) {
      const next = argv[index + 1];
      if (!next) usage(`missing value for ${value}`);
      const key = value === "--diff-file" ? "diffFile" : value.slice(2);
      result[key] = next;
      index += 1;
      continue;
    }
    if (value === "--help" || value === "-h") usage(null, 0);
    usage(`unknown argument: ${value}`);
  }
  if (result.diffFile && (result.base || result.head)) usage("--diff-file cannot be combined with --base/--head");
  return result;
}

function usage(error, code = 2) {
  if (error) console.error(`change-airlock: ${error}`);
  console.error("usage: node scripts/change-airlock.mjs [--base <ref> --head <ref>] [--policy <json>] [--output <json>]\n       node scripts/change-airlock.mjs --diff-file <path> [--policy <json>] [--output <json>]");
  process.exit(code);
}
