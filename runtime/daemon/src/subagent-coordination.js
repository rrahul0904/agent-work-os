import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createVerificationReceipt } from './harness-policy.js';

export const SUBAGENT_COORDINATION_VERSION = 'subagent-coordination/v1';

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

function positiveInteger(value, field, fallback) {
  const candidate = value ?? fallback;
  if (!Number.isInteger(candidate) || candidate <= 0) throw new TypeError(`${field} must be a positive integer`);
  return candidate;
}

function normalizedRelativePath(value, field) {
  const candidate = nonEmptyString(value, field);
  if (candidate.includes('\0') || path.isAbsolute(candidate)) throw new Error(`${field} must be a safe relative path`);
  const normalized = path.normalize(candidate);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) throw new Error(`${field} escapes task scope`);
  return normalized.split(path.sep).join('/');
}

function sortedUniquePaths(values, field) {
  if (!Array.isArray(values) || values.length === 0) throw new TypeError(`${field} must be a non-empty array`);
  return [...new Set(values.map((value) => normalizedRelativePath(value, field)))].sort();
}

function pathIsWithin(candidate, scope) {
  return candidate === scope || candidate.startsWith(`${scope}/`);
}

function emptyState() {
  return {
    version: SUBAGENT_COORDINATION_VERSION,
    workers: {},
    tasks: {},
    leases: {},
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class DurableSubagentCoordinator {
  constructor({
    statePath,
    now = () => Date.now(),
    idFactory = () => randomUUID(),
  } = {}) {
    this.statePath = path.resolve(nonEmptyString(statePath, 'statePath'));
    if (!path.isAbsolute(this.statePath)) throw new TypeError('statePath must be absolute');
    this.now = now;
    this.idFactory = idFactory;
    this.state = emptyState();
    this.loaded = false;
  }

  async load({ reconcileRestart = true } = {}) {
    try {
      const parsed = JSON.parse(await readFile(this.statePath, 'utf8'));
      if (parsed?.version !== SUBAGENT_COORDINATION_VERSION) throw new Error('unsupported subagent state version');
      this.state = parsed;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      this.state = emptyState();
    }
    this.loaded = true;
    if (reconcileRestart) {
      let changed = this.#expireLeases();
      for (const task of Object.values(this.state.tasks)) {
        if (task.status === 'building' || task.status === 'verifying') {
          const interruptedFrom = task.status;
          task.status = 'interrupted';
          task.interruptedFrom = interruptedFrom;
          changed = true;
        }
      }
      if (changed) await this.#persist();
    }
    return this.snapshot();
  }

  snapshot() {
    this.#assertLoaded();
    return Object.freeze(deepClone(this.state));
  }

  async registerWorker({ workerId, role, providerLaneId = null }) {
    this.#assertLoaded();
    const id = nonEmptyString(workerId, 'workerId');
    const workerRole = nonEmptyString(role, 'role');
    if (!['builder', 'verifier'].includes(workerRole)) throw new Error('role must be builder or verifier');
    this.state.workers[id] = {
      workerId: id,
      role: workerRole,
      providerLaneId: providerLaneId == null ? null : nonEmptyString(providerLaneId, 'providerLaneId'),
    };
    await this.#persist();
    return Object.freeze(deepClone(this.state.workers[id]));
  }

  async createTask({
    taskId,
    workspaceId,
    scopePaths,
    builderId,
    verifierId,
    maxVerificationRounds = 2,
  }) {
    this.#assertLoaded();
    const id = nonEmptyString(taskId, 'taskId');
    if (this.state.tasks[id]) throw new Error('task already exists');
    const builder = this.#requireWorker(builderId, 'builder');
    const verifier = this.#requireWorker(verifierId, 'verifier');
    if (builder.workerId === verifier.workerId) throw new Error('builder and verifier must be different workers');
    const task = {
      taskId: id,
      workspaceId: nonEmptyString(workspaceId, 'workspaceId'),
      scopePaths: sortedUniquePaths(scopePaths, 'scopePaths'),
      builderId: builder.workerId,
      verifierId: verifier.workerId,
      status: 'queued',
      buildAttempts: 0,
      verificationRounds: 0,
      maxVerificationRounds: positiveInteger(maxVerificationRounds, 'maxVerificationRounds', 2),
      latestBuildEvidence: [],
      latestVerificationReceipt: null,
      findings: [],
      interruptedFrom: null,
    };
    this.state.tasks[id] = task;
    await this.#persist();
    return Object.freeze(deepClone(task));
  }

  async claimTask({ taskId, workerId }) {
    this.#assertLoaded();
    const task = this.#requireTask(taskId);
    if (workerId !== task.builderId) throw new Error('only the assigned builder may claim this task');
    if (!['queued', 'rework', 'interrupted'].includes(task.status)) throw new Error(`task cannot be claimed from status ${task.status}`);
    task.status = 'building';
    task.buildAttempts += 1;
    task.interruptedFrom = null;
    await this.#persist();
    return Object.freeze(deepClone(task));
  }

  async acquireEditLease({ taskId, workerId, paths, ttlMs = 30_000 }) {
    this.#assertLoaded();
    const task = this.#requireTask(taskId);
    if (workerId !== task.builderId || task.status !== 'building') {
      throw new Error('edit leases require the active assigned builder');
    }
    this.#expireLeases();
    const requested = sortedUniquePaths(paths, 'paths');
    for (const requestedPath of requested) {
      if (!task.scopePaths.some((scope) => pathIsWithin(requestedPath, scope))) {
        throw new Error(`edit path is outside task scope: ${requestedPath}`);
      }
    }

    const activeLeases = Object.values(this.state.leases);
    for (const lease of activeLeases) {
      if (lease.taskId === task.taskId && lease.workerId === workerId) continue;
      const overlap = requested.find((requestedPath) => lease.paths.some(
        (leasedPath) => pathIsWithin(requestedPath, leasedPath) || pathIsWithin(leasedPath, requestedPath),
      ));
      if (overlap) throw new Error(`edit lease conflict on ${overlap}`);
    }

    const leaseId = nonEmptyString(this.idFactory(), 'leaseId');
    const lease = {
      leaseId,
      taskId: task.taskId,
      workerId,
      paths: requested,
      acquiredAtMs: this.now(),
      expiresAtMs: this.now() + positiveInteger(ttlMs, 'ttlMs', 30_000),
    };
    this.state.leases[leaseId] = lease;
    await this.#persist();
    return Object.freeze(deepClone(lease));
  }

  async releaseEditLease({ leaseId, workerId }) {
    this.#assertLoaded();
    const id = nonEmptyString(leaseId, 'leaseId');
    const lease = this.state.leases[id];
    if (!lease) return false;
    if (lease.workerId !== workerId) throw new Error('only the lease owner may release an edit lease');
    delete this.state.leases[id];
    await this.#persist();
    return true;
  }

  async submitForVerification({ taskId, workerId, evidenceIds }) {
    this.#assertLoaded();
    const task = this.#requireTask(taskId);
    if (workerId !== task.builderId || task.status !== 'building') {
      throw new Error('only the active builder may submit for verification');
    }
    this.#expireLeases();
    if (Object.values(this.state.leases).some((lease) => lease.taskId === task.taskId)) {
      throw new Error('all edit leases must be released before verification');
    }
    if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) throw new TypeError('evidenceIds must be non-empty');
    task.latestBuildEvidence = [...new Set(evidenceIds.map((id) => nonEmptyString(id, 'evidenceId')))].sort();
    task.status = 'verifying';
    await this.#persist();
    return Object.freeze(deepClone(task));
  }

  async verifyTask({ taskId, verifierId, outcome, findings = [] }) {
    this.#assertLoaded();
    const task = this.#requireTask(taskId);
    if (task.status !== 'verifying') throw new Error('task is not awaiting verification');
    if (verifierId !== task.verifierId) throw new Error('only the assigned verifier may verify this task');
    if (!Array.isArray(findings) || !findings.every((item) => typeof item === 'string' && item.trim())) {
      throw new TypeError('findings must be an array of non-empty strings');
    }
    const receipt = createVerificationReceipt({
      builderId: task.builderId,
      verifierId,
      outcome,
      checks: task.latestBuildEvidence,
    });
    task.verificationRounds += 1;
    task.latestVerificationReceipt = receipt;
    task.findings = [...findings];

    if (outcome === 'accepted') {
      task.status = 'done';
    } else if (task.verificationRounds >= task.maxVerificationRounds) {
      task.status = 'blocked';
    } else {
      task.status = 'rework';
    }

    await this.#persist();
    return Object.freeze(deepClone(task));
  }

  async interruptTask({ taskId }) {
    this.#assertLoaded();
    const task = this.#requireTask(taskId);
    if (!['building', 'verifying'].includes(task.status)) throw new Error('only in-flight tasks can be interrupted');
    task.interruptedFrom = task.status;
    task.status = 'interrupted';
    for (const [leaseId, lease] of Object.entries(this.state.leases)) {
      if (lease.taskId === task.taskId) delete this.state.leases[leaseId];
    }
    await this.#persist();
    return Object.freeze(deepClone(task));
  }

  #requireWorker(workerId, expectedRole) {
    const id = nonEmptyString(workerId, 'workerId');
    const worker = this.state.workers[id];
    if (!worker) throw new Error(`unknown worker: ${id}`);
    if (worker.role !== expectedRole) throw new Error(`worker ${id} must have role ${expectedRole}`);
    return worker;
  }

  #requireTask(taskId) {
    const id = nonEmptyString(taskId, 'taskId');
    const task = this.state.tasks[id];
    if (!task) throw new Error(`unknown task: ${id}`);
    return task;
  }

  #expireLeases() {
    const now = this.now();
    let changed = false;
    for (const [leaseId, lease] of Object.entries(this.state.leases)) {
      if (lease.expiresAtMs <= now) {
        delete this.state.leases[leaseId];
        changed = true;
      }
    }
    return changed;
  }

  #assertLoaded() {
    if (!this.loaded) throw new Error('coordinator must be loaded before use');
  }

  async #persist() {
    const directory = path.dirname(this.statePath);
    await mkdir(directory, { recursive: true });
    const temporaryPath = `${this.statePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, { flag: 'w' });
    await rename(temporaryPath, this.statePath);
  }
}
