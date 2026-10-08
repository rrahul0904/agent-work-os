import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const TERMINAL_RUN_STATES = new Set(["SHIPPED", "FAILED", "BLOCKED", "CANCELLED", "INTERRUPTED"]);
const STATUS_WEIGHT = Object.freeze({
  SHIPPED: -1000,
  BLOCKED: -40,
  UAT_REQUIRED: 18,
  PREVIEW_REVIEW: 16,
  VERIFYING: 14,
  BUILDING: 12,
  READY: 10,
  BACKLOG: 0
});

export async function loadPortfolio(filePath) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    const projects = Array.isArray(parsed) ? parsed : parsed.projects;
    if (!Array.isArray(projects)) throw new Error("portfolio_projects_invalid");
    return projects.map(normalizeProject);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export function rankPortfolio(projects) {
  return projects
    .map((project) => ({ ...project, priorityScore: scoreProject(project) }))
    .sort((a, b) => b.priorityScore - a.priorityScore || a.name.localeCompare(b.name));
}

export function scoreProject(project) {
  const value = clamp(project.value, 1, 5, 3);
  const effort = clamp(project.effort, 1, 5, 3);
  const risk = clamp(project.risk, 1, 5, 3);
  const readiness = clamp(project.readiness, 0, 100, 0);
  const blockers = Array.isArray(project.blockers) ? project.blockers.length : 0;
  const status = String(project.status || "BACKLOG").toUpperCase();
  if (status === "SHIPPED") return -1000;
  return Math.round(value * 20 + readiness * 0.55 - effort * 8 - risk * 6 - blockers * 14 + (STATUS_WEIGHT[status] ?? 0));
}

export async function listShippingRuns(root) {
  let names;
  try { names = await readdir(root); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const runs = [];
  for (const name of names.filter((name) => name.endsWith(".json")).sort()) {
    try {
      const run = JSON.parse(await readFile(path.join(root, name), "utf8"));
      if (run && typeof run.runId === "string") runs.push(run);
    } catch {}
  }
  return runs.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

export async function listReceipts(root) {
  const files = [];
  await walkJson(root, root, files);
  const receipts = [];
  for (const file of files) {
    try {
      const receipt = JSON.parse(await readFile(file.absolute, "utf8"));
      receipts.push({ ...receipt, path: file.relative });
    } catch {}
  }
  return receipts.sort((a, b) => String(b.shippedAt || b.production?.deployedAt || b.project?.releaseVersion || "").localeCompare(String(a.shippedAt || a.production?.deployedAt || a.project?.releaseVersion || "")));
}

export function buildProductSummary({ portfolio = [], runs = [], receipts = [], machines = [], sessions = [] }) {
  const ranked = rankPortfolio(portfolio);
  const activeRuns = runs.filter((run) => !TERMINAL_RUN_STATES.has(run.state));
  const blockers = [
    ...runs.filter((run) => run.state === "BLOCKED").map((run) => ({ source: "run", id: run.runId, projectId: run.projectId, blocker: run.blocker })),
    ...ranked.flatMap((project) => (project.blockers || []).map((blocker) => ({ source: "portfolio", id: project.id, projectId: project.id, blocker })))
  ];
  return {
    generatedAt: new Date().toISOString(),
    counts: {
      projects: ranked.length,
      shippedProjects: ranked.filter((project) => project.status === "SHIPPED").length,
      activeRuns: activeRuns.length,
      receipts: receipts.length,
      blockers: blockers.length,
      onlineMachines: machines.filter((machine) => machine.status === "online").length,
      activeSessions: sessions.filter((session) => !["completed", "failed", "interrupted"].includes(session.status)).length
    },
    nextProject: ranked.find((project) => project.status !== "SHIPPED") ?? null,
    blockers,
    portfolio: ranked,
    runs,
    receipts
  };
}

function normalizeProject(project) {
  if (!project || typeof project !== "object") throw new Error("portfolio_project_invalid");
  if (!nonEmpty(project.id) || !nonEmpty(project.name)) throw new Error("portfolio_project_identity_required");
  return {
    id: project.id,
    name: project.name,
    repository: project.repository ?? null,
    category: project.category ?? "product",
    status: String(project.status ?? "BACKLOG").toUpperCase(),
    readiness: clamp(project.readiness, 0, 100, 0),
    value: clamp(project.value, 1, 5, 3),
    effort: clamp(project.effort, 1, 5, 3),
    risk: clamp(project.risk, 1, 5, 3),
    blockers: Array.isArray(project.blockers) ? project.blockers.filter(Boolean) : [],
    nextAction: project.nextAction ?? null,
    evidence: Array.isArray(project.evidence) ? project.evidence : [],
    updatedAt: project.updatedAt ?? null
  };
}

async function walkJson(root, current, files) {
  let entries;
  try { entries = await readdir(current, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) await walkJson(root, absolute, files);
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push({ absolute, relative: path.relative(root, absolute) });
  }
}
function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
function nonEmpty(value) { return typeof value === "string" && value.trim().length > 0; }
