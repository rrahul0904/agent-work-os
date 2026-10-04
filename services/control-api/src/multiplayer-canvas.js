import crypto from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MULTIPLAYER_CANVAS_VERSION = 'multiplayer-canvas/v1';
export const NODE_KINDS = Object.freeze(['agent', 'terminal', 'note']);
export const NODE_STATES = Object.freeze([
  'idle',
  'starting',
  'running',
  'needs_input',
  'completed',
  'error',
  'stopped',
  'hibernated',
  'interrupted'
]);
export const MEMBER_ROLES = Object.freeze(['viewer', 'driver']);

const LIVE_STATES = new Set(['starting', 'running', 'needs_input']);
const TRANSITIONS = Object.freeze({
  idle: new Set(['starting', 'stopped', 'hibernated']),
  starting: new Set(['running', 'error', 'stopped', 'hibernated']),
  running: new Set(['needs_input', 'completed', 'error', 'stopped', 'hibernated']),
  needs_input: new Set(['running', 'completed', 'error', 'stopped', 'hibernated']),
  completed: new Set(['starting', 'stopped', 'hibernated']),
  error: new Set(['starting', 'stopped', 'hibernated']),
  stopped: new Set(['starting', 'hibernated']),
  hibernated: new Set(['idle', 'starting', 'stopped']),
  interrupted: new Set(['starting', 'stopped', 'hibernated'])
});

const DEFAULT_LEASE_SECONDS = 60;
const MIN_LEASE_SECONDS = 15;
const MAX_LEASE_SECONDS = 300;
const MAX_RECEIPTS = 1000;
const MAX_CONTEXT_CHARS = 12_000;

export class MultiplayerCanvasStore {
  constructor(filePath, { clock = () => new Date() } = {}) {
    this.filePath = filePath;
    this.clock = clock;
    this.state = { version: MULTIPLAYER_CANVAS_VERSION, canvases: {}, idempotency: {} };
    this.writeChain = Promise.resolve();
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      this.state = {
        version: MULTIPLAYER_CANVAS_VERSION,
        canvases: parsed.canvases ?? {},
        idempotency: parsed.idempotency ?? {}
      };
      let recovered = false;
      for (const canvas of Object.values(this.state.canvases)) {
        canvas.receipts ??= [];
        canvas.members ??= [];
        canvas.nodes ??= [];
        canvas.links ??= [];
        for (const node of canvas.nodes) {
          if (LIVE_STATES.has(node.status)) {
            const from = node.status;
            node.status = 'interrupted';
            node.updatedAt = this.#nowIso();
            this.#receipt(canvas, 'node.lifecycle.recovered', {
              nodeId: node.id,
              from,
              to: 'interrupted',
              reason: 'control_plane_restart'
            });
            recovered = true;
          }
        }
        if (canvas.driverLease?.status === 'active') {
          canvas.driverLease = {
            ...canvas.driverLease,
            status: 'revoked',
            revokedAt: this.#nowIso(),
            revokeReason: 'control_plane_restart'
          };
          this.#receipt(canvas, 'driver.revoked', {
            actorId: canvas.driverLease.actorId,
            leaseId: canvas.driverLease.id,
            reason: 'control_plane_restart'
          });
          recovered = true;
        }
      }
      if (recovered) await this.#persist();
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  listCanvases() {
    return Object.values(this.state.canvases)
      .map((canvas) => this.publicCanvas(canvas.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  publicCanvas(id) {
    const canvas = this.state.canvases[id];
    if (!canvas) return undefined;
    return structuredClone({
      ...canvas,
      driverLease: publicLease(canvas.driverLease)
    });
  }

  async createCanvas({ roomId, name }) {
    const cleanRoomId = cleanRequired(roomId, 'room_id_required', 120);
    const cleanName = cleanRequired(name, 'canvas_name_required', 120);
    const now = this.#nowIso();
    const canvas = {
      id: crypto.randomUUID(),
      version: MULTIPLAYER_CANVAS_VERSION,
      roomId: cleanRoomId,
      name: cleanName,
      members: [],
      nodes: [],
      links: [],
      driverLease: undefined,
      receipts: [],
      createdAt: now,
      updatedAt: now
    };
    this.state.canvases[canvas.id] = canvas;
    this.#receipt(canvas, 'canvas.created', { roomId: cleanRoomId });
    await this.#persist();
    return this.publicCanvas(canvas.id);
  }

  async upsertMember(canvasId, { actorId, displayName, role }) {
    const canvas = this.#canvas(canvasId);
    const id = cleanRequired(actorId, 'actor_id_required', 160);
    const normalizedRole = String(role ?? '').trim();
    if (!MEMBER_ROLES.includes(normalizedRole)) throw new Error('member_role_invalid');
    const name = cleanRequired(displayName ?? id, 'display_name_required', 160);
    const now = this.#nowIso();
    const existing = canvas.members.find((member) => member.actorId === id);
    const previousRole = existing?.role;
    const member = existing ?? { actorId: id, joinedAt: now };
    Object.assign(member, { displayName: name, role: normalizedRole, updatedAt: now });
    if (!existing) canvas.members.push(member);

    if (previousRole === 'driver' && normalizedRole !== 'driver' && canvas.driverLease?.status === 'active' && canvas.driverLease.actorId === id) {
      this.#revokeLease(canvas, 'driver_role_removed');
    }
    canvas.updatedAt = now;
    this.#receipt(canvas, 'member.upserted', { actorId: id, previousRole, role: normalizedRole });
    await this.#persist();
    return structuredClone(member);
  }

  async addNode(canvasId, input) {
    const canvas = this.#canvas(canvasId);
    const kind = String(input.kind ?? '').trim();
    if (!NODE_KINDS.includes(kind)) throw new Error('node_kind_invalid');
    const title = cleanRequired(input.title ?? kind, 'node_title_required', 160);
    const now = this.#nowIso();
    const node = {
      id: crypto.randomUUID(),
      kind,
      title,
      x: finiteNumber(input.x, 0),
      y: finiteNumber(input.y, 0),
      width: boundedNumber(input.width, 240, 120, 1600),
      height: boundedNumber(input.height, 180, 80, 1200),
      sessionId: optionalClean(input.sessionId, 160),
      roomAgentId: optionalClean(input.roomAgentId, 160),
      status: 'idle',
      healthEvidence: undefined,
      createdAt: now,
      updatedAt: now
    };
    if (kind === 'agent' && !node.roomAgentId) throw new Error('agent_node_requires_room_agent_id');
    canvas.nodes.push(node);
    canvas.updatedAt = now;
    this.#receipt(canvas, 'node.added', { nodeId: node.id, kind, sessionId: node.sessionId });
    await this.#persist();
    return structuredClone(node);
  }

  async updateLayout(canvasId, nodeId, layout) {
    const canvas = this.#canvas(canvasId);
    const node = this.#node(canvas, nodeId);
    node.x = finiteNumber(layout.x, node.x);
    node.y = finiteNumber(layout.y, node.y);
    node.width = boundedNumber(layout.width, node.width, 120, 1600);
    node.height = boundedNumber(layout.height, node.height, 80, 1200);
    node.updatedAt = this.#nowIso();
    canvas.updatedAt = node.updatedAt;
    this.#receipt(canvas, 'node.layout.updated', { nodeId: node.id, x: node.x, y: node.y, width: node.width, height: node.height });
    await this.#persist();
    return structuredClone(node);
  }

  async transitionNode(canvasId, nodeId, input) {
    const canvas = this.#canvas(canvasId);
    const node = this.#node(canvas, nodeId);
    const target = String(input.to ?? '').trim();
    if (!NODE_STATES.includes(target)) throw new Error('node_state_invalid');
    const payload = {
      nodeId,
      from: node.status,
      to: target,
      reason: optionalClean(input.reason, 1000),
      healthEvidence: normalizeHealthEvidence(input.healthEvidence, node.sessionId)
    };
    const idem = this.#replay(canvasId, 'node.lifecycle', input.idempotencyKey, payload);
    if (idem) return { ...structuredClone(idem.result), duplicate: true };

    if (!TRANSITIONS[node.status]?.has(target)) throw new Error(`node_transition_invalid:${node.status}:${target}`);
    if (target === 'running' && !payload.healthEvidence) throw new Error('running_requires_health_evidence');
    if (target === 'completed' && !['running', 'needs_input'].includes(node.status)) throw new Error('completion_requires_live_node');

    const from = node.status;
    node.status = target;
    node.updatedAt = this.#nowIso();
    node.healthEvidence = target === 'running' ? payload.healthEvidence : node.healthEvidence;
    if (target === 'error') node.lastError = payload.reason || 'agent_error';
    if (target === 'starting') {
      node.lastError = undefined;
      node.healthEvidence = undefined;
    }
    canvas.updatedAt = node.updatedAt;
    const receipt = this.#receipt(canvas, 'node.lifecycle.changed', {
      nodeId: node.id,
      from,
      to: target,
      reason: payload.reason,
      healthEvidenceDigest: payload.healthEvidence ? digest(payload.healthEvidence) : undefined
    });
    const result = { node: structuredClone(node), receipt: structuredClone(receipt), duplicate: false };
    this.#recordReplay(canvasId, 'node.lifecycle', input.idempotencyKey, payload, result);
    await this.#persist();
    return result;
  }

  async addContextLink(canvasId, input) {
    const canvas = this.#canvas(canvasId);
    const source = this.#node(canvas, input.sourceNodeId);
    const target = this.#node(canvas, input.targetNodeId);
    if (source.id === target.id) throw new Error('context_link_self_reference');
    const share = String(input.share ?? 'summary').trim();
    if (!['summary', 'transcript', 'artifacts'].includes(share)) throw new Error('context_share_invalid');
    const duplicate = canvas.links.find((link) => link.sourceNodeId === source.id && link.targetNodeId === target.id && link.share === share);
    if (duplicate) return structuredClone(duplicate);
    const now = this.#nowIso();
    const link = {
      id: crypto.randomUUID(),
      sourceNodeId: source.id,
      targetNodeId: target.id,
      share,
      maxChars: boundedNumber(input.maxChars, 4000, 256, MAX_CONTEXT_CHARS),
      gate: 'source_completed',
      execution: 'none',
      requiresReview: input.requiresReview !== false,
      createdAt: now
    };
    canvas.links.push(link);
    canvas.updatedAt = now;
    this.#receipt(canvas, 'context.link.added', {
      linkId: link.id,
      sourceNodeId: source.id,
      targetNodeId: target.id,
      share,
      gate: link.gate,
      execution: link.execution
    });
    await this.#persist();
    return structuredClone(link);
  }

  contextLinkStatus(canvasId, linkId) {
    const canvas = this.#canvas(canvasId);
    const link = canvas.links.find((candidate) => candidate.id === linkId);
    if (!link) throw new Error('context_link_not_found');
    const source = this.#node(canvas, link.sourceNodeId);
    return {
      linkId: link.id,
      ready: source.status === 'completed',
      sourceStatus: source.status,
      execution: 'none',
      requiresReview: link.requiresReview
    };
  }

  async acquireDriver(canvasId, input) {
    const canvas = this.#canvas(canvasId);
    const actorId = cleanRequired(input.actorId, 'actor_id_required', 160);
    const member = canvas.members.find((candidate) => candidate.actorId === actorId);
    if (!member || member.role !== 'driver') throw new Error('driver_role_required');
    if (input.idempotencyKey) throw new Error('driver_idempotency_secret_unsupported');
    const leaseSeconds = clampLease(input.leaseSeconds);

    this.#expireLeaseIfNeeded(canvas);
    if (canvas.driverLease?.status === 'active' && canvas.driverLease.actorId !== actorId) throw new Error('driver_lease_busy');
    if (canvas.driverLease?.status === 'active' && canvas.driverLease.actorId === actorId) throw new Error('driver_lease_already_active');

    const token = crypto.randomBytes(32).toString('base64url');
    const acquired = this.#now();
    const lease = {
      id: crypto.randomUUID(),
      actorId,
      status: 'active',
      acquiredAt: acquired.toISOString(),
      expiresAt: new Date(acquired.getTime() + leaseSeconds * 1000).toISOString(),
      tokenHash: digest(token)
    };
    canvas.driverLease = lease;
    canvas.updatedAt = acquired.toISOString();
    const receipt = this.#receipt(canvas, 'driver.acquired', { actorId, leaseId: lease.id, expiresAt: lease.expiresAt });
    await this.#persist();
    return { lease: publicLease(lease), token, receipt: structuredClone(receipt), duplicate: false };
  }

  authorizeInput(canvasId, { actorId, token }) {
    const canvas = this.#canvas(canvasId);
    this.#expireLeaseIfNeeded(canvas);
    const lease = canvas.driverLease;
    if (!lease || lease.status !== 'active') throw new Error('driver_lease_inactive');
    if (lease.actorId !== actorId) throw new Error('driver_lease_actor_mismatch');
    if (!token || !timingSafeDigestEqual(lease.tokenHash, digest(token))) throw new Error('driver_lease_token_invalid');
    return { authorized: true, leaseId: lease.id, actorId: lease.actorId, expiresAt: lease.expiresAt };
  }

  async revokeDriver(canvasId, { actorId, reason = 'released' }) {
    const canvas = this.#canvas(canvasId);
    this.#expireLeaseIfNeeded(canvas);
    if (!canvas.driverLease || canvas.driverLease.status !== 'active') throw new Error('driver_lease_inactive');
    if (canvas.driverLease.actorId !== actorId) throw new Error('driver_lease_actor_mismatch');
    const lease = this.#revokeLease(canvas, optionalClean(reason, 500) || 'released');
    await this.#persist();
    return publicLease(lease);
  }

  #canvas(id) {
    const canvas = this.state.canvases[id];
    if (!canvas) throw new Error('canvas_not_found');
    return canvas;
  }

  #node(canvas, id) {
    const node = canvas.nodes.find((candidate) => candidate.id === id);
    if (!node) throw new Error('canvas_node_not_found');
    return node;
  }

  #now() {
    const value = this.clock();
    return value instanceof Date ? value : new Date(value);
  }

  #nowIso() {
    return this.#now().toISOString();
  }

  #expireLeaseIfNeeded(canvas) {
    const lease = canvas.driverLease;
    if (!lease || lease.status !== 'active') return;
    if (Date.parse(lease.expiresAt) > this.#now().getTime()) return;
    lease.status = 'expired';
    lease.expiredAt = this.#nowIso();
    canvas.updatedAt = lease.expiredAt;
    this.#receipt(canvas, 'driver.expired', { actorId: lease.actorId, leaseId: lease.id });
  }

  #revokeLease(canvas, reason) {
    const lease = canvas.driverLease;
    if (!lease || lease.status !== 'active') return lease;
    lease.status = 'revoked';
    lease.revokedAt = this.#nowIso();
    lease.revokeReason = reason;
    canvas.updatedAt = lease.revokedAt;
    this.#receipt(canvas, 'driver.revoked', { actorId: lease.actorId, leaseId: lease.id, reason });
    return lease;
  }

  #receipt(canvas, type, data) {
    const occurredAt = this.#nowIso();
    const body = { type, canvasId: canvas.id, occurredAt, ...stripUndefined(data) };
    const receipt = { id: crypto.randomUUID(), ...body, digest: digest(body) };
    canvas.receipts.push(receipt);
    if (canvas.receipts.length > MAX_RECEIPTS) canvas.receipts.splice(0, canvas.receipts.length - MAX_RECEIPTS);
    return receipt;
  }

  #replay(canvasId, operation, idempotencyKey, payload) {
    if (!idempotencyKey) return undefined;
    const key = replayKey(canvasId, operation, idempotencyKey);
    const existing = this.state.idempotency[key];
    if (!existing) return undefined;
    if (existing.payloadDigest !== digest(payload)) throw new Error('idempotency_conflict');
    return existing;
  }

  #recordReplay(canvasId, operation, idempotencyKey, payload, result) {
    if (!idempotencyKey) return;
    const key = replayKey(canvasId, operation, idempotencyKey);
    this.state.idempotency[key] = { payloadDigest: digest(payload), result: structuredClone(result) };
  }

  async #persist() {
    const snapshot = JSON.stringify(this.state, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
      await writeFile(tmp, snapshot, { encoding: 'utf8', mode: 0o600 });
      await rename(tmp, this.filePath);
    });
    return this.writeChain;
  }
}

function normalizeHealthEvidence(value, expectedSessionId) {
  if (!value) return undefined;
  if (value.healthy !== true) throw new Error('health_evidence_not_healthy');
  const sessionId = cleanRequired(value.sessionId, 'health_session_id_required', 160);
  if (expectedSessionId && sessionId !== expectedSessionId) throw new Error('health_session_mismatch');
  const observedAt = cleanRequired(value.observedAt, 'health_observed_at_required', 80);
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error('health_observed_at_invalid');
  const source = cleanRequired(value.source, 'health_source_required', 120);
  return { healthy: true, sessionId, observedAt: new Date(observedAt).toISOString(), source };
}

function publicLease(lease) {
  if (!lease) return undefined;
  const { tokenHash: _tokenHash, ...safe } = lease;
  return structuredClone(safe);
}

function replayKey(canvasId, operation, idempotencyKey) {
  return `${canvasId}:${operation}:${String(idempotencyKey).slice(0, 200)}`;
}

function clampLease(value) {
  const parsed = Number(value ?? DEFAULT_LEASE_SECONDS);
  if (!Number.isFinite(parsed)) return DEFAULT_LEASE_SECONDS;
  return Math.max(MIN_LEASE_SECONDS, Math.min(MAX_LEASE_SECONDS, Math.trunc(parsed)));
}

function cleanRequired(value, error, max) {
  const text = String(value ?? '').trim().slice(0, max);
  if (!text) throw new Error(error);
  return text;
}

function optionalClean(value, max) {
  const text = String(value ?? '').trim().slice(0, max);
  return text || undefined;
}

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedNumber(value, fallback, min, max) {
  return Math.max(min, Math.min(max, finiteNumber(value, fallback)));
}

function stripUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function digest(value) {
  const text = typeof value === 'string' ? value : canonicalJson(value);
  return crypto.createHash('sha256').update(text).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function timingSafeDigestEqual(left, right) {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
