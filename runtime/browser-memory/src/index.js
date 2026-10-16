import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const MEMORY_VERSION = 1;
const SECRET_KEY = /(password|passwd|cookie|authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|secret|session[-_]?token)/i;
const SECRET_VALUE = /^(?:bearer\s+[a-z0-9._~+\/-]+=*|sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9]{20,})$/i;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function digest(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
}

function normalizeSite(input) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('UNSUPPORTED_SITE_PROTOCOL');
  return `${url.protocol}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}`;
}

function normalizeGoal(goal) {
  const normalized = String(goal ?? '').trim().replace(/\s+/g, ' ');
  if (!normalized) throw new Error('GOAL_REQUIRED');
  return normalized;
}

function assertNoSecrets(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) throw new Error(`SECRET_FIELD_REJECTED:${path}.${key}`);
      assertNoSecrets(child, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && SECRET_VALUE.test(value.trim())) {
    throw new Error(`SECRET_VALUE_REJECTED:${path}`);
  }
}

async function ensureNotSymlink(path) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function ensureSafeRoot(root) {
  const absolute = resolve(root);
  const parent = dirname(absolute);
  await ensureNotSymlink(parent);
  await ensureNotSymlink(absolute);
  await mkdir(absolute, { recursive: true, mode: 0o700 });
  await ensureNotSymlink(absolute);
  return absolute;
}

function newMemory({ site, workspaceId, profileId }) {
  return {
    version: MEMORY_VERSION,
    site,
    scope: { workspaceId, profileId },
    goals: {},
  };
}

function emptySuggestion(reason, extra = {}) {
  return {
    memoryHit: false,
    trusted: false,
    advisory: true,
    mustRevalidate: true,
    fallbackRequired: true,
    reason,
    ...extra,
  };
}

export class BrowserLearningMemory {
  constructor({
    root,
    verificationThreshold = 2,
    failureThreshold = 2,
    clock = () => new Date().toISOString(),
  }) {
    if (!root) throw new Error('MEMORY_ROOT_REQUIRED');
    this.root = root;
    this.verificationThreshold = verificationThreshold;
    this.failureThreshold = failureThreshold;
    this.clock = clock;
  }

  scopeKey({ workspaceId, profileId }) {
    if (!workspaceId || !profileId) throw new Error('WORKSPACE_AND_PROFILE_REQUIRED');
    return digest({ workspaceId: String(workspaceId), profileId: String(profileId) }).slice(0, 24);
  }

  siteKey(url) {
    return digest(normalizeSite(url)).slice(0, 24);
  }

  async memoryPath({ url, workspaceId, profileId }) {
    const root = await ensureSafeRoot(this.root);
    const dir = join(root, this.scopeKey({ workspaceId, profileId }));
    await ensureNotSymlink(dir);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await ensureNotSymlink(dir);
    const file = join(dir, `${this.siteKey(url)}.json`);
    await ensureNotSymlink(file);
    return file;
  }

  async load(scope) {
    const site = normalizeSite(scope.url);
    const path = await this.memoryPath(scope);
    try {
      const text = await readFile(path, 'utf8');
      const parsed = JSON.parse(text);
      if (parsed.version !== MEMORY_VERSION || parsed.site !== site) {
        return { ok: false, reason: 'MEMORY_VERSION_OR_SITE_MISMATCH', path };
      }
      return { ok: true, memory: parsed, path };
    } catch (error) {
      if (error?.code === 'ENOENT') return { ok: false, reason: 'MEMORY_MISS', path };
      if (error instanceof SyntaxError) return { ok: false, reason: 'MEMORY_CORRUPT', path };
      throw error;
    }
  }

  async suggest({ url, goal, workspaceId, profileId }) {
    const normalizedGoal = normalizeGoal(goal);
    let loaded;
    try {
      loaded = await this.load({ url, workspaceId, profileId });
    } catch (error) {
      return emptySuggestion('MEMORY_UNAVAILABLE', { error: String(error.message ?? error) });
    }
    if (!loaded.ok) return emptySuggestion(loaded.reason);

    const goalId = digest(normalizedGoal);
    const record = loaded.memory.goals[goalId];
    if (!record?.revisions?.length) return emptySuggestion('GOAL_MISS');

    const ranked = [...record.revisions].sort((a, b) => {
      const trust = Number(b.status === 'trusted') - Number(a.status === 'trusted');
      if (trust) return trust;
      const fresh = Number(a.status !== 'stale') - Number(b.status !== 'stale');
      if (fresh) return fresh;
      if (b.verifiedSuccesses !== a.verifiedSuccesses) return b.verifiedSuccesses - a.verifiedSuccesses;
      return b.revision - a.revision;
    });
    const route = ranked[0];

    return {
      memoryHit: true,
      trusted: route.status === 'trusted',
      advisory: true,
      mustRevalidate: true,
      fallbackRequired: route.status !== 'trusted',
      goal: normalizedGoal,
      route: structuredClone(route),
    };
  }

  async learn({
    url,
    goal,
    steps,
    workspaceId,
    profileId,
    sessionId,
    outcome,
    verification = {},
    evidenceDigest = null,
    drift = false,
  }) {
    const site = normalizeSite(url);
    const normalizedGoal = normalizeGoal(goal);
    if (!Array.isArray(steps) || steps.length === 0) throw new Error('ROUTE_STEPS_REQUIRED');
    assertNoSecrets(steps);
    assertNoSecrets(verification);

    const path = await this.memoryPath({ url, workspaceId, profileId });
    const loaded = await this.load({ url, workspaceId, profileId });
    const memory = loaded.ok ? loaded.memory : newMemory({ site, workspaceId, profileId });
    const goalId = digest(normalizedGoal);
    const routeFingerprint = digest({ goal: normalizedGoal, steps });
    const goalRecord = memory.goals[goalId] ?? { goal: normalizedGoal, revisions: [] };
    let route = goalRecord.revisions.find((item) => item.fingerprint === routeFingerprint && item.status !== 'superseded');
    const now = this.clock();

    if (!route) {
      const active = goalRecord.revisions.filter((item) => item.status !== 'superseded');
      for (const previous of active) {
        if (previous.status === 'stale') previous.status = 'superseded';
      }
      route = {
        routeId: `route_${routeFingerprint.slice(0, 16)}`,
        fingerprint: routeFingerprint,
        revision: Math.max(0, ...goalRecord.revisions.map((item) => item.revision ?? 0)) + 1,
        steps: structuredClone(steps),
        status: 'candidate',
        verifiedSuccesses: 0,
        consecutiveFailures: 0,
        firstObservedAt: now,
        lastObservedAt: now,
        evidence: [],
      };
      goalRecord.revisions.push(route);
    }

    route.lastObservedAt = now;
    const verifiedSuccess = outcome === 'success' && verification?.verified === true;
    if (verifiedSuccess) {
      route.verifiedSuccesses += 1;
      route.consecutiveFailures = 0;
      if (route.verifiedSuccesses >= this.verificationThreshold) route.status = 'trusted';
    } else if (outcome === 'failure') {
      route.consecutiveFailures += 1;
      if (route.consecutiveFailures >= this.failureThreshold) route.status = 'stale';
    }
    if (drift) route.status = 'stale';

    const event = {
      at: now,
      sessionId: sessionId ? String(sessionId) : null,
      outcome,
      verified: verification?.verified === true,
      verificationKind: verification?.kind ?? null,
      evidenceDigest,
      drift: Boolean(drift),
    };
    route.evidence.push(event);
    if (route.evidence.length > 25) route.evidence = route.evidence.slice(-25);
    memory.goals[goalId] = goalRecord;

    const receiptPayload = {
      memoryVersion: MEMORY_VERSION,
      site,
      scopeKey: this.scopeKey({ workspaceId, profileId }),
      goalId,
      routeId: route.routeId,
      revision: route.revision,
      status: route.status,
      verifiedSuccesses: route.verifiedSuccesses,
      consecutiveFailures: route.consecutiveFailures,
      outcome,
      verified: verifiedSuccess,
      evidenceDigest,
      at: now,
    };
    const receipt = { ...receiptPayload, receiptDigest: `sha256:${digest(receiptPayload)}` };
    memory.lastReceipt = receipt;

    await this.atomicWrite(path, memory);
    return { route: structuredClone(route), receipt };
  }

  async invalidate({ url, goal, workspaceId, profileId, routeId, reason = 'explicit-drift' }) {
    const normalizedGoal = normalizeGoal(goal);
    const loaded = await this.load({ url, workspaceId, profileId });
    if (!loaded.ok) return emptySuggestion(loaded.reason);
    const goalId = digest(normalizedGoal);
    const goalRecord = loaded.memory.goals[goalId];
    const route = goalRecord?.revisions?.find((item) => item.routeId === routeId);
    if (!route) return emptySuggestion('ROUTE_MISS');
    route.status = 'stale';
    route.invalidatedAt = this.clock();
    route.invalidationReason = reason;
    await this.atomicWrite(loaded.path, loaded.memory);
    return { invalidated: true, routeId, status: route.status, reason };
  }

  async atomicWrite(path, value) {
    await ensureNotSymlink(path);
    const tmp = `${path}.tmp-${process.pid}`;
    await ensureNotSymlink(tmp);
    await writeFile(tmp, `${stableJson(value)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(tmp, path);
    await ensureNotSymlink(path);
  }
}

export const __test = { digest, normalizeSite, normalizeGoal, assertNoSecrets, stableJson };
