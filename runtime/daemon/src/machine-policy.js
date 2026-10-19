import fs from "node:fs";
import path from "node:path";

const VALID_PERMISSIONS = new Set(["read", "write", "execute"]);

function splitList(value, separator) {
  if (!value) return [];
  return String(value).split(separator).map((item) => item.trim()).filter(Boolean);
}

function canonicalizeExistingOrParent(target) {
  let cursor = path.resolve(target);
  const suffix = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
  const real = fs.realpathSync.native(cursor);
  return path.resolve(real, ...suffix);
}

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function createMachinePolicy({ workspaceRoots = [], permissions = [], commands = [] } = {}) {
  const roots = [...new Set(workspaceRoots.map((root) => fs.realpathSync.native(path.resolve(root))))];
  const grants = new Set(permissions);
  for (const permission of grants) {
    if (!VALID_PERMISSIONS.has(permission)) throw new Error(`machine_policy_permission_invalid:${permission}`);
  }

  const commandNames = new Set();
  const commandPaths = new Set();
  for (const command of commands) {
    if (!command) continue;
    if (path.isAbsolute(command) || command.includes("/") || command.includes("\\")) commandPaths.add(path.resolve(command));
    else commandNames.add(command);
  }

  function assertPermission(permission) {
    if (!grants.has(permission)) throw new Error(`machine_policy_permission_denied:${permission}`);
  }

  function resolveWorkspacePath(input = ".", permission = "read") {
    assertPermission(permission);
    if (roots.length === 0) throw new Error("machine_policy_workspace_roots_unconfigured");
    const requested = path.resolve(String(input));
    const canonical = canonicalizeExistingOrParent(requested);
    if (!roots.some((root) => within(root, canonical))) throw new Error("machine_policy_path_denied");
    return canonical;
  }

  function assertCommand(program) {
    assertPermission("execute");
    if (!program || typeof program !== "string") throw new Error("machine_policy_command_invalid");
    const pathLike = path.isAbsolute(program) || program.includes("/") || program.includes("\\");
    const allowed = pathLike ? commandPaths.has(path.resolve(program)) : commandNames.has(program);
    if (!allowed) throw new Error(`machine_policy_command_denied:${program}`);
    return program;
  }

  return {
    enabled: roots.length > 0 && grants.size > 0,
    assertPermission,
    resolveWorkspacePath,
    assertCommand,
    describe() {
      return {
        enabled: roots.length > 0 && grants.size > 0,
        workspaceRoots: [...roots],
        permissions: [...grants].sort(),
        commands: [...commandNames, ...commandPaths].sort()
      };
    }
  };
}

export function createMachinePolicyFromEnv(env = process.env) {
  return createMachinePolicy({
    workspaceRoots: splitList(env.AGENT_WORK_OS_WORKSPACE_ROOTS, path.delimiter),
    permissions: splitList(env.AGENT_WORK_OS_MACHINE_PERMISSIONS, ","),
    commands: splitList(env.AGENT_WORK_OS_EXEC_ALLOW, ",")
  });
}
