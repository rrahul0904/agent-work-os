import { createHash, randomUUID } from 'node:crypto';

const SUPPORTED_PRIMITIVES = new Set(['box', 'cylinder']);
const SUPPORTED_AGENTS = new Set(['codex', 'claude-code', 'gemini-cli', 'opencode', 'custom']);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex');
}

function positiveNumber(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number`);
  return value;
}

export function validateModelSpec(input) {
  if (!input || typeof input !== 'object') throw new Error('model spec must be an object');
  const primitive = input.primitive;
  if (!SUPPORTED_PRIMITIVES.has(primitive)) throw new Error(`unsupported primitive: ${primitive}`);
  const units = input.units ?? 'mm';
  if (units !== 'mm') throw new Error('P1 supports millimeters only');

  const dimensions = { ...input.dimensions };
  if (primitive === 'box') {
    positiveNumber(dimensions.width, 'width');
    positiveNumber(dimensions.depth, 'depth');
    positiveNumber(dimensions.height, 'height');
  } else {
    positiveNumber(dimensions.radius, 'radius');
    positiveNumber(dimensions.height, 'height');
  }

  return {
    schemaVersion: 'cad.agent.model/v1',
    id: String(input.id ?? 'untitled'),
    name: String(input.name ?? 'Untitled model'),
    units,
    primitive,
    dimensions,
    parameters: Array.isArray(input.parameters) ? input.parameters : [],
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  };
}

export function measureModel(specInput) {
  const spec = validateModelSpec(specInput);
  if (spec.primitive === 'box') {
    const { width, depth, height } = spec.dimensions;
    return {
      bounds: { x: width, y: depth, z: height },
      volume: width * depth * height,
      surfaceArea: 2 * (width * depth + width * height + depth * height),
    };
  }
  const { radius, height } = spec.dimensions;
  return {
    bounds: { x: radius * 2, y: radius * 2, z: height },
    volume: Math.PI * radius * radius * height,
    surfaceArea: 2 * Math.PI * radius * (radius + height),
  };
}

export function geometryAssertions(specInput, assertions = []) {
  const spec = validateModelSpec(specInput);
  const measured = measureModel(spec);
  return assertions.map((assertion) => {
    const actual = assertion.path.split('.').reduce((value, key) => value?.[key], measured);
    const tolerance = Number.isFinite(assertion.tolerance) ? assertion.tolerance : 0;
    const expected = assertion.expected;
    const ok = Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance;
    return { ...assertion, actual, ok };
  });
}

export function createBuildReceipt({ spec, source = 'unknown', assertions = [], engine = 'p1-analytic' }) {
  const normalized = validateModelSpec(spec);
  const measurements = measureModel(normalized);
  const checks = geometryAssertions(normalized, assertions);
  const payload = {
    schemaVersion: 'cad.agent.build-receipt/v1',
    source,
    engine,
    spec: normalized,
    measurements,
    assertions: checks,
    valid: checks.every((item) => item.ok),
  };
  return { ...payload, digest: sha256(payload) };
}

export function createFeedbackPacket({ modelDigest, selection = null, measurements = [], annotations = [], message = '' }) {
  if (!/^[a-f0-9]{64}$/.test(String(modelDigest))) throw new Error('modelDigest must be a SHA-256 hex digest');
  const packet = {
    schemaVersion: 'cad.agent.feedback/v1',
    feedbackId: randomUUID(),
    modelDigest,
    selection,
    measurements,
    annotations,
    message: String(message),
  };
  return { ...packet, contentDigest: sha256({ ...packet, feedbackId: undefined }) };
}

export function buildAgentLaunch({ agent, workspace, extraArgs = [] }) {
  if (!SUPPORTED_AGENTS.has(agent)) throw new Error(`unsupported agent adapter: ${agent}`);
  if (typeof workspace !== 'string' || !workspace || workspace.includes('\0')) throw new Error('invalid workspace');
  if (!Array.isArray(extraArgs) || extraArgs.some((arg) => typeof arg !== 'string')) throw new Error('extraArgs must be strings');

  const commands = {
    codex: ['codex'],
    'claude-code': ['claude'],
    'gemini-cli': ['gemini'],
    opencode: ['opencode'],
    custom: [],
  };
  return { cwd: workspace, argv: [...commands[agent], ...extraArgs], shell: false };
}
