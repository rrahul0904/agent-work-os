import { createHash } from 'node:crypto';

export const PRESENTATION_SCHEMA_VERSION = 1;

export const SHIPPING_STATUSES = Object.freeze([
  'RESEARCHED',
  'SPECIFIED',
  'IMPLEMENTED_LOCAL',
  'CI_GREEN',
  'RUNTIME_VERIFIED',
  'UAT_VERIFIED',
  'SHIPPED',
]);

export const SLIDE_OBJECT_TYPES = Object.freeze([
  'text',
  'shape',
  'image',
  'chart',
  'table',
  'diagram',
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function deterministicId(kind, value) {
  if (!kind || typeof kind !== 'string') {
    throw new TypeError('kind must be a non-empty string');
  }
  const digest = createHash('sha256')
    .update(`${kind}\n${stableStringify(value)}`)
    .digest('hex')
    .slice(0, 24);
  return `${kind}_${digest}`;
}

function push(errors, path, code, message) {
  errors.push({ path, code, message });
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateFrame(frame, path, errors) {
  if (!frame || typeof frame !== 'object') {
    push(errors, path, 'frame.required', 'object frame is required');
    return;
  }
  for (const key of ['x', 'y', 'width', 'height']) {
    if (!isFiniteNumber(frame[key])) {
      push(errors, `${path}.${key}`, 'frame.number', `${key} must be a finite number`);
    }
  }
  if (isFiniteNumber(frame.width) && frame.width <= 0) {
    push(errors, `${path}.width`, 'frame.positive', 'width must be greater than zero');
  }
  if (isFiniteNumber(frame.height) && frame.height <= 0) {
    push(errors, `${path}.height`, 'frame.positive', 'height must be greater than zero');
  }
}

function validateAccessibility(object, path, errors) {
  const semanticNonText = ['image', 'chart', 'diagram'].includes(object.type);
  if (!semanticNonText) return;
  const altText = object.accessibility?.altText;
  if (typeof altText !== 'string' || altText.trim().length === 0) {
    push(
      errors,
      `${path}.accessibility.altText`,
      'accessibility.alt_text_required',
      `${object.type} objects require non-empty alt text`,
    );
  }
}

function validateObject(object, path, errors) {
  if (!object || typeof object !== 'object') {
    push(errors, path, 'object.required', 'slide object is required');
    return;
  }
  if (typeof object.id !== 'string' || !object.id) {
    push(errors, `${path}.id`, 'object.id_required', 'object id is required');
  }
  if (!SLIDE_OBJECT_TYPES.includes(object.type)) {
    push(
      errors,
      `${path}.type`,
      'object.type_invalid',
      `object type must be one of: ${SLIDE_OBJECT_TYPES.join(', ')}`,
    );
  }
  validateFrame(object.frame, `${path}.frame`, errors);
  validateAccessibility(object, path, errors);

  if (object.type === 'chart') {
    if (!object.data || !Array.isArray(object.data.series) || object.data.series.length === 0) {
      push(errors, `${path}.data.series`, 'chart.series_required', 'chart requires at least one data series');
    }
    if (object.native !== true) {
      push(errors, `${path}.native`, 'native.required', 'Phase A charts must be native/editable');
    }
  }

  if (object.type === 'table' && object.native !== true) {
    push(errors, `${path}.native`, 'native.required', 'Phase A tables must be native/editable');
  }

  if (object.type === 'diagram' && Array.isArray(object.edges)) {
    for (const [index, edge] of object.edges.entries()) {
      if (!edge?.from?.nodeId || !edge?.to?.nodeId) {
        push(
          errors,
          `${path}.edges[${index}]`,
          'diagram.endpoint_required',
          'diagram edges require explicit from/to node ids',
        );
      }
    }
  }
}

export function validateDeckPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object') {
    return [{ path: '$', code: 'plan.required', message: 'deck plan is required' }];
  }
  if (plan.schemaVersion !== PRESENTATION_SCHEMA_VERSION) {
    push(errors, '$.schemaVersion', 'schema.version', `schemaVersion must equal ${PRESENTATION_SCHEMA_VERSION}`);
  }
  if (typeof plan.projectId !== 'string' || !plan.projectId) {
    push(errors, '$.projectId', 'project.id_required', 'projectId is required');
  }
  if (typeof plan.title !== 'string' || !plan.title.trim()) {
    push(errors, '$.title', 'deck.title_required', 'deck title is required');
  }
  if (!Array.isArray(plan.slides) || plan.slides.length === 0) {
    push(errors, '$.slides', 'slides.required', 'at least one slide is required');
    return errors;
  }

  const slideIds = new Set();
  const objectIds = new Set();
  for (const [slideIndex, slide] of plan.slides.entries()) {
    const slidePath = `$.slides[${slideIndex}]`;
    if (!slide || typeof slide !== 'object') {
      push(errors, slidePath, 'slide.required', 'slide is required');
      continue;
    }
    if (typeof slide.id !== 'string' || !slide.id) {
      push(errors, `${slidePath}.id`, 'slide.id_required', 'slide id is required');
    } else if (slideIds.has(slide.id)) {
      push(errors, `${slidePath}.id`, 'slide.id_duplicate', `duplicate slide id: ${slide.id}`);
    } else {
      slideIds.add(slide.id);
    }
    if (typeof slide.title !== 'string' || !slide.title.trim()) {
      push(errors, `${slidePath}.title`, 'slide.title_required', 'slide title is required');
    }
    if (!Array.isArray(slide.objects)) {
      push(errors, `${slidePath}.objects`, 'objects.required', 'slide objects must be an array');
      continue;
    }
    for (const [objectIndex, object] of slide.objects.entries()) {
      const objectPath = `${slidePath}.objects[${objectIndex}]`;
      validateObject(object, objectPath, errors);
      if (object?.id) {
        if (objectIds.has(object.id)) {
          push(errors, `${objectPath}.id`, 'object.id_duplicate', `duplicate object id: ${object.id}`);
        } else {
          objectIds.add(object.id);
        }
      }
    }
  }
  return errors;
}

export function assertDeckPlan(plan) {
  const errors = validateDeckPlan(plan);
  if (errors.length) {
    const error = new Error(`invalid presentation deck plan (${errors.length} errors)`);
    error.name = 'PresentationContractError';
    error.errors = errors;
    throw error;
  }
  return plan;
}

export function nextShippingStatus(current, evidence = {}) {
  const index = SHIPPING_STATUSES.indexOf(current);
  if (index === -1) throw new Error(`unknown shipping status: ${current}`);
  if (current === 'SHIPPED') return current;

  const requiredByTarget = {
    SPECIFIED: ['dossier', 'shippingContract'],
    IMPLEMENTED_LOCAL: ['localTests'],
    CI_GREEN: ['exactSha', 'ci'],
    RUNTIME_VERIFIED: ['runtime'],
    UAT_VERIFIED: ['uat'],
    SHIPPED: ['trackerPromotion'],
  };

  const target = SHIPPING_STATUSES[index + 1];
  const missing = (requiredByTarget[target] ?? []).filter((key) => evidence[key] !== true);
  if (missing.length) {
    return { status: current, blocked: true, target, missing };
  }
  return { status: target, blocked: false, target: null, missing: [] };
}
