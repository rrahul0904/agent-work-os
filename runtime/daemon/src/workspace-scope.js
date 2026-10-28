import fs from "node:fs/promises";
import path from "node:path";

function deny(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
function within(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

/**
 * Second, independent authorization in the workstation daemon. The API's
 * tenant RBAC cannot authorize arbitrary workstation filesystem traversal.
 * Roots must be provisioned locally by the workstation operator.
 */
export async function authorizeWorkspace(raw, {
  roots = process.env.AGENT_WORK_OS_ALLOWED_WORKSPACE_ROOTS,
  mode = process.env.NODE_ENV,
  realpath = fs.realpath,
} = {}) {
  if (typeof raw !== "string" || !path.isAbsolute(raw) || raw.includes("\0")) {
    throw deny("WORKSPACE_ABSOLUTE_PATH_REQUIRED");
  }
  const candidate = path.resolve(raw);
  if (mode !== "production" && (!roots || (Array.isArray(roots) && roots.length === 0))) return candidate;
  const permitted = typeof roots === "string" ? roots.split(path.delimiter).filter(Boolean)
    : Array.isArray(roots) ? roots : [];
  if (!permitted.length) throw deny("WORKSPACE_OPERATOR_ROOTS_REQUIRED");
  let target;
  try { target = await realpath(candidate); }
  catch { throw deny("WORKSPACE_PATH_NOT_FOUND_OR_INACCESSIBLE"); }
  for (const root of permitted) {
    if (typeof root !== "string" || !path.isAbsolute(root)) continue;
    let actualRoot;
    try { actualRoot = await realpath(path.resolve(root)); }
    catch { continue; }
    if (actualRoot === path.parse(actualRoot).root) continue; // filesystem root grants are forbidden
    if (within(actualRoot, target)) return target;
  }
  throw deny("WORKSPACE_PATH_OUTSIDE_OPERATOR_SCOPE");
}

export function canExecuteShipping(env = process.env) {
  return env.NODE_ENV !== "production" || env.AGENT_WORK_OS_SHIPPING_EXECUTION_APPROVED === "true";
}
