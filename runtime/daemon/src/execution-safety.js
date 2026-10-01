import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { authorizeRepositoryPath } from './repository-intelligence.js';

export const EXECUTION_SAFETY_VERSION = 'execution-safety/v1';

const MUTATING_CAPABILITIES = new Set([
  'repo.write',
  'checkpoint.restore',
  'shell.mutate',
  'github.write',
  'browser.mutate',
  'python',
]);

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

function sortedUnique(values = [], field = 'values') {
  if (!Array.isArray(values)) throw new TypeError(`${field} must be an array`);
  return [...new Set(values.map((value) => nonEmptyString(value, field)))].sort();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Buffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeAction(action, index) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) throw new TypeError(`action ${index} must be an object`);
  const id = nonEmptyString(action.id, `action ${index} id`);
  const capability = nonEmptyString(action.capability, `action ${index} capability`);
  const kind = nonEmptyString(action.kind, `action ${index} kind`);
  const target = action.target == null ? null : nonEmptyString(action.target, `action ${index} target`);
  const summary = action.summary == null ? null : nonEmptyString(action.summary, `action ${index} summary`);
  return Object.freeze({ id, capability, kind, target, summary });
}

function requireAbsolutePath(value, field) {
  const candidate = nonEmptyString(value, field);
  if (!path.isAbsolute(candidate)) throw new TypeError(`${field} must be absolute`);
  return path.resolve(candidate);
}

function assertCheckpointRootOutsideRepository(repositoryRoot, checkpointRoot) {
  const rel = path.relative(repositoryRoot, checkpointRoot);
  if (rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel))) {
    throw new Error('checkpointRoot must be outside the repository root');
  }
}

function checkpointDirectory(checkpointRoot, checkpointId) {
  return path.join(checkpointRoot, checkpointId);
}

function checkpointFilePath(checkpointRoot, checkpointId, relativePath) {
  return path.join(checkpointDirectory(checkpointRoot, checkpointId), 'files', ...relativePath.split('/'));
}

async function readCheckpointManifest(checkpointRoot, checkpointId) {
  const id = nonEmptyString(checkpointId, 'checkpointId');
  const manifestPath = path.join(checkpointDirectory(checkpointRoot, id), 'manifest.json');
  const parsed = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (parsed?.version !== EXECUTION_SAFETY_VERSION || parsed?.checkpointId !== id || !Array.isArray(parsed.entries)) {
    throw new Error('invalid checkpoint manifest');
  }
  return parsed;
}

export function createActionPlan({ workspaceId, checkpointId = null, actions = [] }) {
  const workspace = nonEmptyString(workspaceId, 'workspaceId');
  if (!Array.isArray(actions) || actions.length === 0) throw new TypeError('actions must be a non-empty array');
  const normalizedActions = actions.map(normalizeAction);
  const actionIds = normalizedActions.map((action) => action.id);
  if (new Set(actionIds).size !== actionIds.length) throw new Error('action ids must be unique');
  const requiredCapabilities = sortedUnique(normalizedActions.map((action) => action.capability), 'capabilities');
  const mutatingCapabilities = requiredCapabilities.filter((capability) => MUTATING_CAPABILITIES.has(capability));
  const base = {
    version: EXECUTION_SAFETY_VERSION,
    workspaceId: workspace,
    checkpointId: checkpointId == null ? null : nonEmptyString(checkpointId, 'checkpointId'),
    actions: normalizedActions,
    requiredCapabilities,
    mutatingCapabilities,
  };
  const planId = sha256(stableJson(base));
  return Object.freeze({
    ...base,
    planId,
    dryRun: true,
    requiresApproval: mutatingCapabilities.length > 0,
  });
}

export function authorizeActionPlan({ plan, approvedBy, approvedCapabilities = [], confirmPlanId }) {
  if (!plan?.planId || plan.version !== EXECUTION_SAFETY_VERSION) throw new TypeError('valid action plan is required');
  const approver = nonEmptyString(approvedBy, 'approvedBy');
  if (nonEmptyString(confirmPlanId, 'confirmPlanId') !== plan.planId) throw new Error('plan confirmation does not match exact plan id');
  const approved = sortedUnique(approvedCapabilities, 'approvedCapabilities');
  const missingCapabilities = plan.mutatingCapabilities.filter((capability) => !approved.includes(capability));
  if (missingCapabilities.length > 0) {
    throw new Error(`missing approvals for: ${missingCapabilities.join(', ')}`);
  }
  const receiptBase = {
    version: EXECUTION_SAFETY_VERSION,
    planId: plan.planId,
    approvedBy: approver,
    approvedCapabilities: approved,
  };
  return Object.freeze({
    ...receiptBase,
    authorizationId: sha256(stableJson(receiptBase)),
  });
}

export function assertPlanAuthorized(plan, authorization) {
  if (!plan?.planId) throw new TypeError('plan is required');
  if (!authorization?.authorizationId) throw new Error('authorization receipt is required');
  if (authorization.version !== EXECUTION_SAFETY_VERSION || authorization.planId !== plan.planId) {
    throw new Error('authorization receipt does not match plan');
  }
  const missingCapabilities = plan.mutatingCapabilities.filter(
    (capability) => !authorization.approvedCapabilities?.includes(capability),
  );
  if (missingCapabilities.length > 0) throw new Error('authorization receipt is incomplete');
  return true;
}

export async function createCheckpoint({ policy, checkpointRoot, relativePaths }) {
  if (!policy?.root) throw new TypeError('repository policy is required');
  const storageRoot = requireAbsolutePath(checkpointRoot, 'checkpointRoot');
  assertCheckpointRootOutsideRepository(policy.root, storageRoot);
  const paths = sortedUnique(relativePaths, 'relativePaths');
  if (paths.length === 0) throw new TypeError('relativePaths must be non-empty');
  if (paths.length > policy.maxFiles) throw new Error('checkpoint exceeds repository maxFiles policy');

  const captured = [];
  for (const requestedPath of paths) {
    const authorized = await authorizeRepositoryPath(policy, requestedPath);
    const info = await lstat(authorized.absolutePath);
    if (!info.isFile()) throw new Error(`checkpoint path is not a regular file: ${authorized.relativePath}`);
    if (info.size > policy.maxFileBytes) throw new Error(`checkpoint file exceeds maxFileBytes: ${authorized.relativePath}`);
    const content = await readFile(authorized.absolutePath);
    captured.push({
      path: authorized.relativePath,
      bytes: content.length,
      sha256: sha256Buffer(content),
      content,
    });
  }

  const manifestBase = {
    version: EXECUTION_SAFETY_VERSION,
    repositoryRoot: policy.root,
    entries: captured.map(({ path: filePath, bytes, sha256: digest }) => ({ path: filePath, bytes, sha256: digest })),
  };
  const checkpointId = sha256(stableJson(manifestBase));
  const directory = checkpointDirectory(storageRoot, checkpointId);
  await mkdir(path.join(directory, 'files'), { recursive: true });

  for (const entry of captured) {
    const destination = checkpointFilePath(storageRoot, checkpointId, entry.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, entry.content, { flag: 'w' });
  }

  const manifest = Object.freeze({ ...manifestBase, checkpointId });
  await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'w' });
  return manifest;
}

export async function planCheckpointRestore({ policy, checkpointRoot, checkpointId, workspaceId }) {
  if (!policy?.root) throw new TypeError('repository policy is required');
  const storageRoot = requireAbsolutePath(checkpointRoot, 'checkpointRoot');
  assertCheckpointRootOutsideRepository(policy.root, storageRoot);
  const manifest = await readCheckpointManifest(storageRoot, checkpointId);
  if (manifest.repositoryRoot !== policy.root) throw new Error('checkpoint repository root does not match current repository');

  const actions = [];
  const blockers = [];
  for (const entry of manifest.entries) {
    let authorized;
    try {
      authorized = await authorizeRepositoryPath(policy, entry.path);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        blockers.push(Object.freeze({ path: entry.path, reason: 'target_missing' }));
        continue;
      }
      throw error;
    }
    const current = await readFile(authorized.absolutePath);
    const currentDigest = sha256Buffer(current);
    if (currentDigest === entry.sha256) continue;
    actions.push({
      id: `restore:${entry.path}`,
      capability: 'checkpoint.restore',
      kind: 'restore_file',
      target: entry.path,
      summary: `restore checkpoint content for ${entry.path}`,
    });
  }

  const plan = actions.length === 0
    ? null
    : createActionPlan({ workspaceId, checkpointId: manifest.checkpointId, actions });
  return Object.freeze({
    version: EXECUTION_SAFETY_VERSION,
    checkpointId: manifest.checkpointId,
    plan,
    blockers: Object.freeze(blockers),
    ready: blockers.length === 0,
  });
}

export async function applyCheckpointRestore({ policy, checkpointRoot, restorePreview, authorization }) {
  if (!restorePreview?.ready) throw new Error('restore preview is not ready');
  if (!restorePreview.plan) {
    return Object.freeze({
      version: EXECUTION_SAFETY_VERSION,
      checkpointId: restorePreview.checkpointId,
      planId: null,
      restored: Object.freeze([]),
      changed: false,
    });
  }
  assertPlanAuthorized(restorePreview.plan, authorization);
  const storageRoot = requireAbsolutePath(checkpointRoot, 'checkpointRoot');
  assertCheckpointRootOutsideRepository(policy.root, storageRoot);
  const manifest = await readCheckpointManifest(storageRoot, restorePreview.checkpointId);
  const entries = new Map(manifest.entries.map((entry) => [entry.path, entry]));
  const restored = [];

  for (const action of restorePreview.plan.actions) {
    if (action.kind !== 'restore_file' || action.capability !== 'checkpoint.restore' || !action.target) {
      throw new Error('restore plan contains an unsupported action');
    }
    const entry = entries.get(action.target);
    if (!entry) throw new Error('restore action is not present in checkpoint manifest');
    const authorized = await authorizeRepositoryPath(policy, action.target);
    const checkpointFile = checkpointFilePath(storageRoot, manifest.checkpointId, entry.path);
    const content = await readFile(checkpointFile);
    if (sha256Buffer(content) !== entry.sha256) throw new Error(`checkpoint content hash mismatch: ${entry.path}`);
    await writeFile(authorized.absolutePath, content, { flag: 'w' });
    restored.push(entry.path);
  }

  return Object.freeze({
    version: EXECUTION_SAFETY_VERSION,
    checkpointId: manifest.checkpointId,
    planId: restorePreview.plan.planId,
    authorizationId: authorization.authorizationId,
    restored: Object.freeze(restored),
    changed: restored.length > 0,
  });
}
