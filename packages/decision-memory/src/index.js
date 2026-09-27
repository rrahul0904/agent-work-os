// RE-297 Phase A: independent, local-only decision journal. No vendor implementation or hooks.
import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, open, readFile, realpath, rename, rm, stat, lstat, truncate, writeFile } from 'node:fs/promises';

export const MEMORY_SCHEMA_VERSION = 1;
const sha = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const utc = () => new Date().toISOString();
const required = (value, name, max = 2000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name} must be nonempty text (max ${max})`);
  return value.trim();
};
const optional = (value, name, max = 2000) => value === undefined || value === null ? '' : (value === '' ? '' : required(value, name, max));
const items = (value, name, limit = 16, max = 240) => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > limit) throw new Error(`${name} exceeds ${limit} items`);
  return value.map((v, i) => required(v, `${name}[${i}]`, max));
};
function relativePaths(value, name = 'affectedPaths') {
  return items(value, name).map(p => {
    if (path.isAbsolute(p) || p === '..' || p.startsWith('../') || p.includes('\\') || p.split('/').includes('..') || p.startsWith('/')) throw new Error(`${name} must contain relative paths`);
    return p;
  });
}
const digest = object => sha(object);
function assertHash(object, field = 'contentHash') {
  const { [field]: actual, ...body } = object;
  if (actual !== digest(body)) throw new Error(`Invalid ${field}`);
}
export class JournalCorruption extends Error {
  constructor(message, recoverableTail = false) { super(message); this.name = 'JournalCorruption'; this.recoverableTail = recoverableTail; }
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function atomicJson(file, value) {
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  try { await rename(temp, file); } catch (error) { await rm(temp, { force: true }); throw error; }
  const dir = await open(path.dirname(file), 'r'); try { await dir.sync(); } finally { await dir.close(); }
}
async function rejectSymlink(file) {
  try { if ((await lstat(file)).isSymbolicLink()) throw new Error(`Symlinks are not allowed for memory storage: ${file}`); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
}
function projection(meta) { return { schemaVersion: 1, projectId: meta.projectId, decisions: {}, handoffs: {}, recalls: {} }; }
function scoped(meta, scope) {
  if (!scope || scope.projectId !== meta.projectId || scope.repository !== meta.repository || scope.worktree !== meta.worktree) throw new Error('project/worktree scope mismatch');
}
function apply(view, event, meta) {
  const { operation: op, data } = event;
  if (!['decision.log', 'decision.edit', 'decision.retract', 'handoff.create', 'handoff.recall'].includes(op)) throw new Error(`Unsupported journal event: ${op}`);
  scoped(meta, data.scope);
  if (op === 'decision.log' || op === 'decision.edit') {
    const record = data.record;
    if (record.schemaVersion !== 1 || record.scope.projectId !== meta.projectId) throw new Error('unsupported decision schema/scope');
    scoped(meta, record.scope); assertHash(record);
    if (op === 'decision.log') {
      if (view.decisions[record.id] || record.revision !== 1 || record.status !== 'current') throw new Error('invalid new decision');
      if (record.supersedesId) {
        const prior = view.decisions[record.supersedesId];
        if (!prior || prior.current.status !== 'current') throw new Error('superseded decision is not current');
        prior.current = { ...prior.current, status: 'superseded' };
      }
      view.decisions[record.id] = { current: record, history: [record] };
    } else {
      const prior = view.decisions[record.id];
      if (!prior || prior.current.status !== 'current' || record.revision !== prior.current.revision + 1 || record.status !== 'current') throw new Error('invalid decision revision');
      prior.current = record; prior.history.push(record);
    }
  } else if (op === 'decision.retract') {
    const prior = view.decisions[data.id];
    if (!prior || prior.current.status !== 'current' || prior.current.revision !== data.expectedRevision) throw new Error('invalid decision retraction');
    prior.current = { ...prior.current, status: 'retracted', retractedAt: data.at, retractionReason: data.reason };
  } else if (op === 'handoff.create') {
    const s = data.snapshot;
    if (s.schemaVersion !== 1 || view.handoffs[s.id] || !s.fromSessionId || !Array.isArray(s.decisions)) throw new Error('invalid handoff');
    scoped(meta, s.scope); assertHash(s);
    view.handoffs[s.id] = s;
  } else {
    const proof = data.proof;
    const snapshot = view.handoffs[proof.handoffId];
    if (proof.schemaVersion !== 1 || !snapshot || proof.fromSessionId !== snapshot.fromSessionId || proof.snapshotHash !== snapshot.contentHash || proof.projectId !== meta.projectId || proof.worktree !== meta.worktree || proof.fromSessionId === proof.toSessionId) throw new Error('invalid recall proof');
    if (view.recalls[`${proof.handoffId}:${proof.toSessionId}`]) throw new Error('duplicate recall proof');
    view.recalls[`${proof.handoffId}:${proof.toSessionId}`] = proof;
  }
}

export class DecisionMemory {
  constructor(root, meta) {
    this.root = root;
    this.dir = path.join(root, '.agent-work-os', 'memory');
    this.meta = meta;
    this.scope = { projectId: meta.projectId, repository: meta.repository, worktree: meta.worktree };
    this.journal = path.join(this.dir, 'journal.jsonl');
    this.viewPath = path.join(this.dir, 'current.json');
    this.lockPath = path.join(this.dir, '.write-lock');
  }
  static async init(root, repository) {
    const canonical = await realpath(root);
    const dir = path.join(canonical, '.agent-work-os', 'memory');
    await mkdir(dir, { recursive: true, mode: 0o700 });
    if ((await realpath(dir)) !== dir) throw new Error('memory directory cannot be a symlink');
    const metaPath = path.join(dir, 'scope.json');
    await rejectSymlink(metaPath);
    let meta;
    try {
      const handle = await open(metaPath, 'wx', 0o600);
      meta = { schemaVersion: 1, projectId: crypto.randomUUID(), repository: required(repository ?? path.basename(canonical), 'repository', 240), worktree: canonical };
      try { await handle.writeFile(JSON.stringify(meta, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); }
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const memory = await DecisionMemory.open(canonical);
    if (repository && repository !== memory.meta.repository) throw new Error('repository binding mismatch');
    await memory.withLock(async () => {
      await rejectSymlink(memory.journal);
      const handle = await open(memory.journal, 'a', 0o600); await handle.close();
      const view = await memory.load();
      await atomicJson(memory.viewPath, view);
    });
    return memory;
  }
  static async open(root, { allowCorrupt = false } = {}) {
    const canonical = await realpath(root);
    const dir = path.join(canonical, '.agent-work-os', 'memory');
    if ((await realpath(dir)) !== dir) throw new Error('memory directory cannot be a symlink');
    const metaPath = path.join(dir, 'scope.json'); await rejectSymlink(metaPath);
    const meta = JSON.parse(await readFile(metaPath, 'utf8'));
    if (meta.schemaVersion !== 1 || !meta.projectId || meta.worktree !== canonical || !meta.repository) throw new Error('unsupported memory schema or worktree scope mismatch');
    const memory = new DecisionMemory(canonical, meta);
    for (const file of [memory.journal, memory.viewPath]) await rejectSymlink(file);
    if (!allowCorrupt) await memory.load();
    return memory;
  }
  async withLock(work) {
    for (let i = 0; i < 250; i++) {
      try {
        await mkdir(this.lockPath);
        await writeFile(path.join(this.lockPath, 'owner'), JSON.stringify({ pid: process.pid, at: utc() }), { flag: 'wx' });
        try { return await work(); } finally { await rm(this.lockPath, { recursive: true, force: true }); }
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        try {
          const info = JSON.parse(await readFile(path.join(this.lockPath, 'owner'), 'utf8'));
          if (Number.isSafeInteger(info.pid) && info.pid > 0) {
            let alive = true;
            try { process.kill(info.pid, 0); } catch (err) { if (err.code === 'ESRCH') alive = false; }
            if (!alive) { await rm(this.lockPath, { recursive: true, force: true }); continue; }
          }
        } catch (err) {
          if (err.code !== 'ENOENT' && !(err instanceof SyntaxError)) throw err;
          if (Date.now() - (await stat(this.lockPath)).mtimeMs > 30_000) { await rm(this.lockPath, { recursive: true, force: true }); continue; }
        }
        await pause(20);
      }
    }
    throw new Error('memory journal busy; inspect .write-lock before manual recovery');
  }
  async load() {
    await rejectSymlink(this.journal);
    let raw; try { raw = await readFile(this.journal, 'utf8'); } catch (error) { if (error.code === 'ENOENT') raw = ''; else throw error; }
    const view = projection(this.meta);
    if (!raw) return view;
    if (!raw.endsWith('\n')) throw new JournalCorruption('incomplete trailing journal line (run doctor --repair)', true);
    let previousHash = 'GENESIS'; let seq = 0;
    for (const line of raw.trimEnd().split('\n')) {
      let event;
      try { event = JSON.parse(line); } catch { throw new JournalCorruption(`invalid JSON at journal entry ${seq + 1}`); }
      if (JSON.stringify(event) !== line || event.schemaVersion !== 1 || event.seq !== seq + 1 || event.previousHash !== previousHash) throw new JournalCorruption(`broken journal chain at entry ${seq + 1}`);
      try { assertHash(event, 'hash'); apply(view, event, this.meta); } catch (error) { throw new JournalCorruption(`invalid entry ${seq + 1}: ${error.message}`); }
      seq = event.seq; previousHash = event.hash;
    }
    view.head = { seq, hash: previousHash };
    return view;
  }
  async append(operation, data, duplicate) {
    return this.withLock(async () => {
      const view = await this.load();
      const existing = duplicate?.(view);
      if (existing) return existing;
      const event = { schemaVersion: 1, seq: (view.head?.seq ?? 0) + 1, previousHash: view.head?.hash ?? 'GENESIS', id: crypto.randomUUID(), at: utc(), operation, data };
      event.hash = digest(event);
      // Validate before making a durable journal mutation.
      apply(view, event, this.meta);
      const handle = await open(this.journal, 'a', 0o600);
      try { await handle.writeFile(JSON.stringify(event) + '\n'); await handle.sync(); } finally { await handle.close(); }
      view.head = { seq: event.seq, hash: event.hash };
      await atomicJson(this.viewPath, view); // recoverable cache: journal is authoritative.
      return event;
    });
  }
  async log(input) {
    const now = utc();
    const record = {
      schemaVersion: 1, id: input.id ?? crypto.randomUUID(), revision: 1, status: 'current', scope: this.scope,
      claim: required(input.claim, 'claim'), choice: required(input.choice, 'choice'), rationale: required(input.rationale, 'rationale'),
      provenance: { source: required(input.source, 'source'), sourceHash: required(input.sourceHash, 'sourceHash', 128), actor: required(input.actor, 'actor', 120), recordedAt: now },
      affectedPaths: relativePaths(input.affectedPaths), tags: items(input.tags, 'tags', 12, 64),
      verification: input.verification ?? 'tentative', sensitivity: input.sensitivity ?? 'private', supersedesId: input.supersedesId || null
    };
    if (!['tentative', 'verified'].includes(record.verification) || !['private', 'shareable'].includes(record.sensitivity)) throw new Error('invalid verification/sensitivity');
    record.contentHash = digest(record);
    await this.append('decision.log', { scope: this.scope, record });
    return record;
  }
  async edit(id, expectedRevision, changes) { return this.update(id, expectedRevision, changes); }
  async update(id, expectedRevision, changes) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error('expected revision is required');
    return this.withLock(async () => {
      const view = await this.load(); const prior = view.decisions[id]?.current;
      if (!prior || prior.status !== 'current' || prior.revision !== expectedRevision) throw new Error('revision conflict or inactive decision');
      const valid = ['claim', 'choice', 'rationale', 'source', 'sourceHash', 'actor', 'affectedPaths', 'tags', 'verification', 'sensitivity'];
      if (!Object.keys(changes).length || Object.keys(changes).some(k => !valid.includes(k))) throw new Error('unsupported or empty edit');
      const record = { ...prior, revision: prior.revision + 1, provenance: { ...prior.provenance, recordedAt: utc() } };
      for (const k of ['claim', 'choice', 'rationale']) if (changes[k] !== undefined) record[k] = required(changes[k], k);
      for (const k of ['source', 'sourceHash', 'actor']) if (changes[k] !== undefined) record.provenance[k] = required(changes[k], k, k === 'actor' ? 120 : 2000);
      if (changes.affectedPaths !== undefined) record.affectedPaths = relativePaths(changes.affectedPaths);
      if (changes.tags !== undefined) record.tags = items(changes.tags, 'tags', 12, 64);
      if (changes.verification !== undefined) { if (!['tentative', 'verified'].includes(changes.verification)) throw new Error('invalid verification'); record.verification = changes.verification; }
      if (changes.sensitivity !== undefined) { if (!['private', 'shareable'].includes(changes.sensitivity)) throw new Error('invalid sensitivity'); record.sensitivity = changes.sensitivity; }
      delete record.contentHash; record.contentHash = digest(record);
      await this.writeLocked(view, 'decision.edit', { scope: this.scope, record });
      return record;
    });
  }
  async writeLocked(view, operation, data) {
    const event = { schemaVersion: 1, seq: (view.head?.seq ?? 0) + 1, previousHash: view.head?.hash ?? 'GENESIS', id: crypto.randomUUID(), at: utc(), operation, data };
    event.hash = digest(event); apply(view, event, this.meta);
    const handle = await open(this.journal, 'a', 0o600);
    try { await handle.writeFile(JSON.stringify(event) + '\n'); await handle.sync(); } finally { await handle.close(); }
    view.head = { seq: event.seq, hash: event.hash }; await atomicJson(this.viewPath, view); return event;
  }
  async retract(id, expectedRevision, reason) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error('expected revision is required');
    return this.withLock(async () => {
      const view = await this.load(); const decision = view.decisions[id]?.current;
      if (!decision || decision.status !== 'current' || decision.revision !== expectedRevision) throw new Error('revision conflict or inactive decision');
      const data = { scope: this.scope, id, expectedRevision, reason: required(reason, 'reason', 500), at: utc() };
      await this.writeLocked(view, 'decision.retract', data); return view.decisions[id].current;
    });
  }
  async list({ history = false, query = '' } = {}) {
    const view = await this.load();
    const value = Object.values(view.decisions).map(x => history ? x : x.current).filter(x => history || x.status === 'current');
    return value.filter(x => !query || JSON.stringify(x).toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.id.localeCompare(b.id));
  }
  async inspect(id) { return (await this.load()).decisions[id] ?? null; }
  async handoff(input) {
    return this.withLock(async () => {
    const view = await this.load(); const references = Object.values(view.decisions).map(x => x.current)
      .filter(x => x.status === 'current' && x.verification === 'verified')
      .sort((a, b) => a.id.localeCompare(b.id)).slice(0, 8)
      .map(r => ({ id: r.id, revision: r.revision, contentHash: r.contentHash, sourceHash: r.provenance.sourceHash }));
    const snapshot = {
      schemaVersion: 1, id: crypto.randomUUID(), scope: this.scope,
      fromSessionId: required(input.fromSessionId, 'fromSessionId', 160),
      nativeThreadId: optional(input.nativeThreadId, 'nativeThreadId', 160), machineId: optional(input.machineId, 'machineId', 160),
      capturedAt: utc(), goal: required(input.goal, 'goal', 500), lastActions: items(input.lastActions, 'lastActions', 8),
      changedFiles: relativePaths(input.changedFiles, 'changedFiles').slice(0, 8),
      openTasks: items(input.openTasks, 'openTasks', 8), risks: items(input.risks, 'risks', 8),
      nextAction: optional(input.nextAction, 'nextAction', 300), checks: items(input.checks, 'checks', 8), decisions: references
    };
    snapshot.contentHash = digest(snapshot);
    await this.writeLocked(view, 'handoff.create', { scope: this.scope, snapshot });
    return snapshot;
    });
  }
  async recall(handoffId, toSessionId, machineId = '') {
    return this.withLock(async () => {
      const view = await this.load();
      const prior = view.recalls[`${handoffId}:${toSessionId}`]; if (prior) return prior;
      const snapshot = view.handoffs[handoffId]; if (!snapshot) throw new Error('unknown handoff in this project/worktree');
      const target = required(toSessionId, 'toSessionId', 160);
      if (target === snapshot.fromSessionId) throw new Error('new-session recall requires a distinct session ID');
      if (snapshot.machineId && snapshot.machineId !== machineId) throw new Error('machine binding mismatch');
      const verified = snapshot.decisions.map(ref => {
        const record = view.decisions[ref.id]?.current;
        return record?.status === 'current' && record.verification === 'verified' && record.revision === ref.revision && record.contentHash === ref.contentHash ? {
          id: record.id, revision: record.revision, contentHash: record.contentHash, sourceHash: record.provenance.sourceHash,
          claim: record.claim, choice: record.choice, rationale: record.rationale, provenance: record.provenance
        } : null;
      }).filter(Boolean);
      const proof = { schemaVersion: 1, handoffId, fromSessionId: snapshot.fromSessionId, toSessionId: target,
        projectId: this.meta.projectId, repository: this.meta.repository, worktree: this.root,
        nativeThreadId: snapshot.nativeThreadId, snapshotHash: snapshot.contentHash, verifiedDecisions: verified, recalledAt: utc() };
      await this.writeLocked(view, 'handoff.recall', { scope: this.scope, proof }); return proof;
    });
  }
  async export(format = 'json') {
    const view = await this.load();
    const result = { schemaVersion: 1, scope: this.scope, head: view.head ?? { seq: 0, hash: 'GENESIS' }, decisions: view.decisions, handoffs: view.handoffs, recalls: view.recalls };
    if (format === 'json') return JSON.stringify(result, null, 2) + '\n';
    if (format !== 'markdown') throw new Error('format must be json or markdown');
    // Always a local, private export. Not a sanitised team-sharing format.
    const safe = x => String(x).replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', ' ');
    return `# Local decision-memory export (private)\n\nProject: ${safe(this.meta.projectId)} | Worktree: ${safe(this.root)}\n\n` +
      Object.values(view.decisions).map(({current:r}) => `## ${safe(r.id)} r${r.revision} — ${safe(r.status)}\n\nClaim: ${safe(r.claim)}\n\nChoice: ${safe(r.choice)}\n\nRationale: ${safe(r.rationale)}\n\nProvenance: ${safe(r.provenance.source)}; source SHA: ${safe(r.provenance.sourceHash)}; actor: ${safe(r.provenance.actor)}\n\nContent SHA-256: ${r.contentHash}\n`).join('\n');
  }
  async doctor({ repair = false } = {}) {
    const perform = async () => {
      const findings = [];
      let view;
      try { view = await this.load(); }
      catch (e) {
        if (!(e instanceof JournalCorruption) || !e.recoverableTail || !repair) return { ok: false, findings: [e.message], repaired: false };
        const raw = await readFile(this.journal, 'utf8');
        const last = raw.lastIndexOf('\n');
        await truncate(this.journal, last + 1); findings.push('truncated incomplete trailing journal line');
        try { view = await this.load(); } catch (bad) { return { ok: false, findings: [...findings, bad.message], repaired: true }; }
      }
      let cache; try { cache = JSON.parse(await readFile(this.viewPath, 'utf8')); } catch { findings.push('missing or invalid projection'); }
      if (cache && JSON.stringify(cache) !== JSON.stringify(view)) findings.push('stale projection');
      if (repair && findings.length) await atomicJson(this.viewPath, view);
      return { ok: repair || findings.length === 0, head: view.head ?? { seq: 0, hash: 'GENESIS' }, findings, repaired: repair && findings.length > 0 };
    };
    return repair ? this.withLock(perform) : perform();
  }
}
