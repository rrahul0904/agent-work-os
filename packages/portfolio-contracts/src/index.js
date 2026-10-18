/**
 * Owned Promise Registry: static intake / diff / coverage gate.
 * No upstream source code is used. This does not execute tests, attest CI or deploy.
 */
const CLAUSE = /^\s*-\s+\*\*([A-Z][A-Z0-9]*-[0-9]{3,})\s+—\s+(.+?)\*\*\s*(.*)$/;
const CLAUSE_LIKE = /^\s*-\s+\*\*[A-Z][A-Z0-9]*-[0-9]{3,}/;

export function parsePromises(markdown, source = 'CONTRACT.md') {
  if (typeof markdown !== 'string') throw new TypeError('contract markdown must be a string');
  const found = new Map();
  for (const [offset, line] of markdown.split(/\r?\n/).entries()) {
    const match = CLAUSE.exec(line);
    if (!match) {
      if (CLAUSE_LIKE.test(line)) throw new Error(`${source}:${offset + 1}: malformed promise declaration`);
      continue;
    }
    const [, id, heading, body] = match;
    if (!heading.trim().endsWith('.')) throw new Error(`${source}:${offset + 1}: malformed promise heading (${id})`);
    const text = `${heading.trim()} ${body.trim()}`.trim();
    if (!body.trim()) throw new Error(`${source}:${offset + 1}: empty promise body (${id})`);
    if (found.has(id)) throw new Error(`${source}:${offset + 1}: duplicate promise ID ${id}`);
    found.set(id, { id, text, source, line: offset + 1 });
  }
  return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function diffPromises(previous, current) {
  assertPromiseArray(previous);
  assertPromiseArray(current);
  const oldMap = new Map(previous.map((p) => [p.id, p]));
  const newMap = new Map(current.map((p) => [p.id, p]));
  const changes = [];
  for (const id of [...new Set([...oldMap.keys(), ...newMap.keys()])].sort()) {
    const was = oldMap.get(id)?.text ?? null;
    const now = newMap.get(id)?.text ?? null;
    if (was !== now) changes.push({ id, type: was === null ? 'added' : now === null ? 'removed' : 'changed', was, now });
  }
  return changes;
}

export function auditTestMapping(promises, testMappings) {
  assertPromiseArray(promises);
  if (!Array.isArray(testMappings)) throw new TypeError('testMappings must be an array');
  const ids = new Set(promises.map((p) => p.id));
  const mapping = new Map(promises.map((p) => [p.id, new Set()]));
  const unknown = [];
  for (const [index, entry] of testMappings.entries()) {
    if (!entry || typeof entry !== 'object' || typeof entry.testId !== 'string' || !entry.testId.trim() || !Array.isArray(entry.promiseIds)) {
      throw new Error(`invalid test mapping at index ${index}`);
    }
    if (entry.promiseIds.length === 0) throw new Error(`test mapping ${entry.testId} has no promise IDs`);
    for (const id of entry.promiseIds) {
      if (typeof id !== 'string' || !ids.has(id)) unknown.push({ testId: entry.testId, id });
      else mapping.get(id).add(entry.testId);
    }
  }
  const missing = [...mapping].filter(([, tests]) => tests.size === 0).map(([id]) => id);
  return {
    total: promises.length,
    mapped: promises.length - missing.length,
    missing,
    unknown,
    coverage: promises.length ? (promises.length - missing.length) / promises.length : 0,
    status: !promises.length || missing.length || unknown.length ? 'INCOMPLETE' : 'MAPPED_UNVERIFIED',
    // Mapping is a claim about intended tests, not proof that any tests executed.
    executionVerified: false
  };
}

export function auditChangeApprovals(changes, approvals = {}) {
  if (!Array.isArray(changes) || !approvals || typeof approvals !== 'object' || Array.isArray(approvals)) {
    throw new TypeError('changes must be an array and approvals must be an object');
  }
  const blocked = [];
  for (const change of changes) {
    const approval = approvals[change.id];
    if (!approval || approval.type !== change.type || typeof approval.reason !== 'string' || !approval.reason.trim() ||
      typeof approval.approvedBy !== 'string' || !approval.approvedBy.trim()) {
      blocked.push({ id: change.id, type: change.type, reason: 'explicit approval with matching type, rationale, and approver is required' });
    }
  }
  const unknownApprovals = Object.keys(approvals).filter((id) => !changes.some((c) => c.id === id));
  return { approved: changes.length - blocked.length, blocked, unknownApprovals, status: blocked.length || unknownApprovals.length ? 'BLOCKED' : 'APPROVED' };
}

export function auditPortfolioContract({ currentMarkdown, testMappings, previousMarkdown, approvals } = {}) {
  const current = parsePromises(currentMarkdown);
  const previous = previousMarkdown === undefined ? null : parsePromises(previousMarkdown, 'previous CONTRACT.md');
  const coverage = auditTestMapping(current, testMappings);
  const changes = previous === null ? [] : diffPromises(previous, current);
  const changeApprovals = auditChangeApprovals(changes, approvals ?? {});
  return {
    schema: 'portfolio-contract-audit/v1',
    promises: current.length,
    coverage,
    changes,
    changeApprovals,
    readyForIndependentVerification: coverage.status === 'MAPPED_UNVERIFIED' && changeApprovals.status === 'APPROVED',
    verification: 'NOT_RUN',
    shipping: 'NOT_AUTHORIZED'
  };
}

function assertPromiseArray(promises) {
  if (!Array.isArray(promises) || promises.some((p) => !p || typeof p.id !== 'string' || typeof p.text !== 'string') ||
    new Set(promises.map((p) => p.id)).size !== promises.length) {
    throw new TypeError('promises must be an array with unique IDs and text');
  }
}
