import { createHash } from 'node:crypto';

export const RESEARCH_CONTRACT_VERSION = 'research-evidence/v0.1';

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function requireInteger(value, name) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer`);
  }
  return value;
}

function requireFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalizeText(text) {
  requireString(text, 'text');
  return text.replace(/\r\n?/g, '\n').normalize('NFC');
}

export function createCanonicalDocument({
  documentId,
  sourceId,
  revision,
  mediaType = 'text/plain',
  text,
}) {
  requireString(documentId, 'documentId');
  requireString(sourceId, 'sourceId');
  requireString(revision, 'revision');
  requireString(mediaType, 'mediaType');

  const canonicalText = canonicalizeText(text);
  return Object.freeze({
    contractVersion: RESEARCH_CONTRACT_VERSION,
    documentId,
    sourceId,
    revision,
    mediaType,
    text: canonicalText,
    length: canonicalText.length,
    contentSha256: sha256(canonicalText),
  });
}

export function createEvidenceSpan({ spanId, document, start, end }) {
  requireString(spanId, 'spanId');
  if (!document || document.contractVersion !== RESEARCH_CONTRACT_VERSION) {
    throw new TypeError('document must be a canonical research document');
  }
  requireInteger(start, 'start');
  requireInteger(end, 'end');
  if (start < 0 || end <= start || end > document.text.length) {
    throw new RangeError('evidence span offsets are outside the canonical document');
  }

  const quote = document.text.slice(start, end);
  return Object.freeze({
    contractVersion: RESEARCH_CONTRACT_VERSION,
    spanId,
    documentId: document.documentId,
    sourceId: document.sourceId,
    revision: document.revision,
    start,
    end,
    quote,
    quoteSha256: sha256(quote),
  });
}

export function createClaim({ claimId, text, evidenceSpanIds, kind = 'assertion' }) {
  requireString(claimId, 'claimId');
  requireString(text, 'text');
  requireString(kind, 'kind');
  if (!Array.isArray(evidenceSpanIds) || evidenceSpanIds.length === 0) {
    throw new TypeError('evidenceSpanIds must contain at least one span id');
  }
  const normalizedSpanIds = [...new Set(evidenceSpanIds.map((id) => requireString(id, 'evidenceSpanId')))].sort();

  return Object.freeze({
    contractVersion: RESEARCH_CONTRACT_VERSION,
    claimId,
    kind,
    text: text.trim(),
    evidenceSpanIds: normalizedSpanIds,
  });
}

export function createRetrievalReceipt({
  workspaceId,
  queryId,
  query,
  indexRevision,
  retriever,
  parameters = {},
  results,
}) {
  requireString(workspaceId, 'workspaceId');
  requireString(queryId, 'queryId');
  requireString(query, 'query');
  requireString(indexRevision, 'indexRevision');
  requireString(retriever, 'retriever');
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    throw new TypeError('parameters must be an object');
  }
  if (!Array.isArray(results)) {
    throw new TypeError('results must be an array');
  }

  const normalizedResults = results
    .map((result, index) => ({
      spanId: requireString(result?.spanId, `results[${index}].spanId`),
      rank: result?.rank === undefined ? index + 1 : requireInteger(result.rank, `results[${index}].rank`),
      score: requireFiniteNumber(result?.score, `results[${index}].score`),
    }))
    .sort((a, b) => a.rank - b.rank || a.spanId.localeCompare(b.spanId));

  const payload = {
    contractVersion: RESEARCH_CONTRACT_VERSION,
    workspaceId,
    queryId,
    query: query.trim(),
    indexRevision,
    retriever,
    parameters: stableValue(parameters),
    results: normalizedResults,
  };

  return Object.freeze({
    ...payload,
    receiptSha256: sha256(stableJson(payload)),
  });
}

function indexUnique(items, key, label) {
  const index = new Map();
  for (const item of items) {
    const id = item?.[key];
    requireString(id, `${label}.${key}`);
    if (index.has(id)) throw new Error(`duplicate ${label} id: ${id}`);
    index.set(id, item);
  }
  return index;
}

export function validateResearchBundle({ documents, spans, claims }) {
  if (!Array.isArray(documents) || !Array.isArray(spans) || !Array.isArray(claims)) {
    throw new TypeError('documents, spans, and claims must be arrays');
  }

  const documentsById = indexUnique(documents, 'documentId', 'document');
  const spansById = indexUnique(spans, 'spanId', 'span');
  indexUnique(claims, 'claimId', 'claim');

  const errors = [];

  for (const span of spans) {
    const document = documentsById.get(span.documentId);
    if (!document) {
      errors.push({ code: 'UNKNOWN_DOCUMENT', spanId: span.spanId, documentId: span.documentId });
      continue;
    }
    if (span.sourceId !== document.sourceId || span.revision !== document.revision) {
      errors.push({ code: 'REVISION_MISMATCH', spanId: span.spanId, documentId: span.documentId });
      continue;
    }
    const actualQuote = document.text.slice(span.start, span.end);
    if (actualQuote !== span.quote || sha256(actualQuote) !== span.quoteSha256) {
      errors.push({ code: 'SPAN_INTEGRITY_FAILURE', spanId: span.spanId });
    }
  }

  for (const claim of claims) {
    for (const spanId of claim.evidenceSpanIds) {
      if (!spansById.has(spanId)) {
        errors.push({ code: 'UNKNOWN_EVIDENCE_SPAN', claimId: claim.claimId, spanId });
      }
    }
  }

  return Object.freeze({
    ok: errors.length === 0,
    gate: errors.length === 0 ? 'STRUCTURAL_EVIDENCE_VALID' : 'STRUCTURAL_EVIDENCE_INVALID',
    semanticVerificationRequired: true,
    errors,
  });
}

export function createResearchReceipt({ workspaceId, documents, spans, claims, verifier = 'unassigned' }) {
  requireString(workspaceId, 'workspaceId');
  requireString(verifier, 'verifier');

  const validation = validateResearchBundle({ documents, spans, claims });
  if (!validation.ok) {
    throw new Error(`cannot create research receipt: ${validation.errors.map((error) => error.code).join(', ')}`);
  }

  const payload = {
    contractVersion: RESEARCH_CONTRACT_VERSION,
    workspaceId,
    verifier,
    semanticVerificationRequired: true,
    documentRevisions: documents
      .map(({ documentId, sourceId, revision, contentSha256 }) => ({ documentId, sourceId, revision, contentSha256 }))
      .sort((a, b) => a.documentId.localeCompare(b.documentId)),
    spans: spans
      .map(({ spanId, documentId, sourceId, revision, start, end, quoteSha256 }) => ({
        spanId,
        documentId,
        sourceId,
        revision,
        start,
        end,
        quoteSha256,
      }))
      .sort((a, b) => a.spanId.localeCompare(b.spanId)),
    claims: claims
      .map(({ claimId, kind, text, evidenceSpanIds }) => ({ claimId, kind, text, evidenceSpanIds: [...evidenceSpanIds].sort() }))
      .sort((a, b) => a.claimId.localeCompare(b.claimId)),
  };

  return Object.freeze({
    ...payload,
    receiptSha256: sha256(stableJson(payload)),
  });
}
