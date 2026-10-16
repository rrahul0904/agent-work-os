import {
  createCanonicalDocument,
  createEvidenceSpan,
} from './research-workspace.js';

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

export function ingestTextSource({
  workspaceId,
  sourceId,
  sourceRevision,
  documentId,
  text,
  mediaType = 'text/plain',
}) {
  requireString(workspaceId, 'workspaceId');
  requireString(sourceId, 'sourceId');
  requireString(sourceRevision, 'sourceRevision');
  requireString(documentId, 'documentId');

  return createCanonicalDocument({
    workspaceId,
    documentId,
    sourceId,
    revision: sourceRevision,
    mediaType,
    text,
  });
}

export function chunkCanonicalDocument({
  document,
  maxCharacters = 1200,
  overlapCharacters = 120,
  spanPrefix = 'chunk',
}) {
  if (!document || typeof document.text !== 'string' || !document.workspaceId) {
    throw new TypeError('document must be a canonical research document');
  }
  requirePositiveInteger(maxCharacters, 'maxCharacters');
  if (!Number.isInteger(overlapCharacters) || overlapCharacters < 0) {
    throw new TypeError('overlapCharacters must be a non-negative integer');
  }
  if (overlapCharacters >= maxCharacters) {
    throw new RangeError('overlapCharacters must be smaller than maxCharacters');
  }
  requireString(spanPrefix, 'spanPrefix');

  const spans = [];
  let start = 0;
  let ordinal = 1;

  while (start < document.text.length) {
    const end = Math.min(start + maxCharacters, document.text.length);
    spans.push(createEvidenceSpan({
      spanId: `${spanPrefix}-${document.documentId}-${String(ordinal).padStart(4, '0')}`,
      document,
      start,
      end,
    }));

    if (end === document.text.length) break;
    start = end - overlapCharacters;
    ordinal += 1;
  }

  return Object.freeze(spans);
}
