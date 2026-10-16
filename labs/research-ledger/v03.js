const HISTORY_DB = 'research-ledger-history';
const HISTORY_VERSION = 1;
const SNAPSHOTS = 'snapshots';
const META = 'meta';
const WORKSPACE_ID = 'research-ledger-local';
let branchParentOverride = null;
let captureTimer = null;
let lastObservedFingerprint = '';

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}
function stableJson(value) { return JSON.stringify(stableValue(value)); }
async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function uid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

function openHistoryDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HISTORY_DB, HISTORY_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: 'snapshotId' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function historyPut(storeName, value) {
  const db = await openHistoryDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function historyAll(storeName) {
  const db = await openHistoryDb();
  const values = await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return values;
}
async function historyClear() {
  const db = await openHistoryDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction([SNAPSHOTS, META], 'readwrite');
    tx.objectStore(SNAPSHOTS).clear();
    tx.objectStore(META).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function readNotebookDocuments() {
  return new Promise((resolve) => {
    const request = indexedDB.open('research-ledger');
    request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('documents')) { db.close(); resolve([]); return; }
      const tx = db.transaction('documents', 'readonly');
      const get = tx.objectStore('documents').getAll();
      get.onsuccess = () => { const result = get.result || []; db.close(); resolve(result); };
      get.onerror = () => { db.close(); resolve([]); };
    };
  });
}

async function documentRefs() {
  const docs = await readNotebookDocuments();
  return Promise.all(docs.map(async (doc) => ({
    documentId: doc.id,
    sourceId: doc.id,
    revision: doc.addedAt || 'local',
    title: doc.name || doc.id,
    contentSha256: await sha256(doc.text || ''),
  })));
}
function claimRefs(brief) {
  return (brief.claims || []).map((claim) => ({
    claimId: claim.id,
    text: claim.text,
    evidenceSpanIds: [...new Set(claim.evidence || [])].sort(),
  }));
}
async function normalizeClaims(brief) {
  const claims = claimRefs(brief);
  return Promise.all(claims.map(async (claim) => ({
    claimId: claim.claimId,
    text: claim.text,
    textSha256: await sha256(claim.text),
    evidenceSpanIds: claim.evidenceSpanIds,
  })));
}
async function sourceRefs(brief) {
  return Promise.all((brief.sources || []).map(async (source) => ({
    id: source.id,
    title: source.title || source.id,
    url: source.url || '',
    kind: source.kind || 'source',
    perspective: source.perspective || '',
    passageSha256: await sha256(source.passage || ''),
  })));
}
async function briefFingerprint(brief) { return sha256(stableJson(brief)); }

async function listSnapshots() {
  return (await historyAll(SNAPSHOTS)).sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt));
}
async function latestSnapshot() {
  const snapshots = await listSnapshots();
  return snapshots.at(-1) || null;
}

async function buildSnapshot(brief, reason = 'research-run') {
  const previous = await latestSnapshot();
  const documents = await documentRefs();
  const sources = await sourceRefs(brief);
  const claims = await normalizeClaims(brief);
  const evidenceSetSha256 = await sha256(stableJson({
    documents: documents.map(({ documentId, revision, contentSha256 }) => ({ documentId, revision, contentSha256 })),
    sources: sources.map(({ id, passageSha256, url }) => ({ id, passageSha256, url })),
  }));
  const parentSnapshotIds = branchParentOverride
    ? [branchParentOverride]
    : previous ? [previous.snapshotId] : [];
  const sequence = (previous?.sequence || 0) + 1;
  const fingerprint = await briefFingerprint(brief);
  const payload = {
    contractVersion: 'research-version-graph/v1-browser',
    researchContractVersion: 'research-evidence/v0.2',
    workspaceId: WORKSPACE_ID,
    snapshotId: uid('snapshot'),
    sequence,
    parentSnapshotIds,
    createdAt: new Date().toISOString(),
    reason,
    notebook: $('#notebookName')?.value || 'Product research',
    question: brief.question || $('#question')?.value || 'Research question',
    mode: brief.mode || 'Evidence Brief',
    evidenceSetSha256,
    documents,
    sources,
    claims,
    decision: {
      status: brief.status || 'WORKING',
      confidence: Number(brief.confidence) || 0,
      conclusion: brief.overview || '',
      conclusionSha256: await sha256(brief.overview || ''),
    },
    gaps: [...new Set(brief.gaps || [])].sort(),
    semanticGate: brief.semanticGate || 'SEMANTIC_EVIDENCE_UNVERIFIED',
    briefFingerprint: fingerprint,
    brief,
  };
  const snapshotSha256 = await sha256(stableJson(payload));
  branchParentOverride = null;
  return { ...payload, snapshotSha256 };
}

function compareItems(before, after, idKey, fingerprint) {
  const left = new Map((before || []).map((item) => [item[idKey], item]));
  const right = new Map((after || []).map((item) => [item[idKey], item]));
  const result = { added: [], removed: [], changed: [] };
  for (const [id, item] of right) {
    if (!left.has(id)) result.added.push(id);
    else if (fingerprint(left.get(id)) !== fingerprint(item)) result.changed.push(id);
  }
  for (const id of left.keys()) if (!right.has(id)) result.removed.push(id);
  for (const key of Object.keys(result)) result[key].sort();
  return result;
}
function compareSnapshots(before, after) {
  const documents = compareItems(before?.documents, after?.documents, 'documentId', (item) => `${item.revision}:${item.contentSha256}`);
  const claims = compareItems(before?.claims, after?.claims, 'claimId', (item) => `${item.textSha256}:${(item.evidenceSpanIds || []).join(',')}`);
  return {
    evidenceSetChanged: before?.evidenceSetSha256 !== after?.evidenceSetSha256,
    documents,
    claims,
    decisionChanged: stableJson(before?.decision || {}) !== stableJson(after?.decision || {}),
    semanticGateChanged: before?.semanticGate !== after?.semanticGate,
    gapsAdded: (after?.gaps || []).filter((gap) => !(before?.gaps || []).includes(gap)),
    gapsResolved: (before?.gaps || []).filter((gap) => !(after?.gaps || []).includes(gap)),
  };
}

async function persistCurrentBrief(reason = 'research-run', { force = false } = {}) {
  const raw = localStorage.getItem('research-ledger:last-brief');
  if (!raw) return null;
  let brief;
  try { brief = JSON.parse(raw); } catch { return null; }
  const fingerprint = await briefFingerprint(brief);
  const latest = await latestSnapshot();
  if (!force && (fingerprint === lastObservedFingerprint || fingerprint === latest?.briefFingerprint)) return latest;
  const snapshot = await buildSnapshot(brief, reason);
  await historyPut(SNAPSHOTS, snapshot);
  await historyPut(META, { key: 'latest', snapshotId: snapshot.snapshotId, updatedAt: snapshot.createdAt });
  lastObservedFingerprint = fingerprint;
  await renderVersionHistory();
  return snapshot;
}

function injectUi() {
  if ($('#versionGraphCard')) return;
  const rail = $('.right-rail');
  if (!rail) return;
  const card = document.createElement('div');
  card.className = 'card rail-card';
  card.id = 'versionGraphCard';
  card.innerHTML = `
    <div class="rail-title"><span>Version graph</span><em id="versionGraphState">durable local history</em></div>
    <p class="v03-help">Every grounded run becomes an integrity-hashed snapshot. Branch from an older decision or compare what changed.</p>
    <div class="v03-actions"><button id="saveSnapshotV03">Save snapshot</button><button id="exportHandoffV03">Governed handoff</button></div>
    <div id="replaySummary" class="v03-diff">No replay diff yet.</div>
    <div id="versionList" class="v03-list"><div class="empty-state small">No durable snapshots yet.</div></div>`;
  const lineage = $('#lineageCard');
  rail.insertBefore(card, lineage?.nextSibling || rail.firstChild);

  const dialog = document.createElement('dialog');
  dialog.id = 'snapshotDialogV03';
  dialog.innerHTML = `<form method="dialog"><div class="passage-dialog-head"><div><span class="eyebrow" id="snapshotEyebrowV03">SNAPSHOT</span><h3 id="snapshotTitleV03">Research snapshot</h3></div><button value="cancel" class="icon-close">×</button></div><div id="snapshotBodyV03"></div><div class="dialog-actions"><button type="button" id="branchSnapshotV03">Branch from this</button><button value="cancel">Close</button></div></form>`;
  document.body.appendChild(dialog);

  const style = document.createElement('style');
  style.textContent = `
    .v03-help{font-size:12px;line-height:1.45;color:var(--muted,#6d6a63);margin:0 0 10px}.v03-actions{display:flex;gap:7px;margin-bottom:10px}.v03-actions button{font-size:11px;flex:1}.v03-list{display:grid;gap:7px}.v03-version{width:100%;text-align:left;border:1px solid rgba(30,30,30,.12);background:rgba(255,255,255,.52);border-radius:9px;padding:8px;display:grid;gap:3px}.v03-version strong{font-size:11px}.v03-version small{font-size:10px;opacity:.7}.v03-diff{font-size:10px;line-height:1.45;padding:8px;border-radius:8px;background:rgba(25,99,80,.06);margin-bottom:9px}.v03-hash{font-family:ui-monospace,monospace;font-size:9px;word-break:break-all;opacity:.72}.v03-snapshot-grid{display:grid;gap:10px;max-width:680px}.v03-snapshot-grid section{padding:10px;border:1px solid rgba(0,0,0,.1);border-radius:9px}.v03-snapshot-grid ul{margin:6px 0 0;padding-left:18px}`;
  document.head.appendChild(style);

  $('#saveSnapshotV03').onclick = () => persistCurrentBrief('manual-snapshot', { force: true });
  $('#exportHandoffV03').onclick = exportGovernedHandoff;
  const handoffButton = $('#handoff');
  if (handoffButton) {
    handoffButton.textContent = 'Send governed handoff ↗';
    handoffButton.onclick = exportGovernedHandoff;
  }
  const footerVersion = document.querySelector('.sidebar-footer small');
  if (footerVersion) footerVersion.textContent = 'v0.3';
}

async function renderVersionHistory() {
  injectUi();
  const snapshots = await listSnapshots();
  const list = $('#versionList');
  if (!list) return;
  $('#versionGraphState').textContent = `${snapshots.length} snapshot${snapshots.length === 1 ? '' : 's'}`;
  if (!snapshots.length) {
    list.innerHTML = '<div class="empty-state small">No durable snapshots yet.</div>';
    $('#replaySummary').textContent = 'No replay diff yet.';
    return;
  }
  list.innerHTML = snapshots.slice(-7).reverse().map((snapshot) => `
    <button class="v03-version" data-v03-snapshot="${escapeHtml(snapshot.snapshotId)}">
      <strong>V${snapshot.sequence} · ${escapeHtml(snapshot.decision.status)}</strong>
      <small>${escapeHtml(snapshot.question.slice(0, 68))}</small>
      <small>${Math.round(snapshot.decision.confidence * 100)}% confidence · ${snapshot.parentSnapshotIds.length ? 'variant' : 'root'}</small>
    </button>`).join('');
  list.querySelectorAll('[data-v03-snapshot]').forEach((button) => {
    button.onclick = () => openSnapshot(button.dataset.v03Snapshot);
  });
  if (snapshots.length > 1) {
    const before = snapshots.at(-2);
    const after = snapshots.at(-1);
    const diff = compareSnapshots(before, after);
    const docChanges = diff.documents.added.length + diff.documents.removed.length + diff.documents.changed.length;
    const claimChanges = diff.claims.added.length + diff.claims.removed.length + diff.claims.changed.length;
    $('#replaySummary').textContent = `V${before.sequence} → V${after.sequence}: ${docChanges} document change(s), ${claimChanges} claim change(s), ${diff.gapsAdded.length} gap(s) added, ${diff.gapsResolved.length} resolved.`;
  }
}

async function openSnapshot(snapshotId) {
  const snapshots = await listSnapshots();
  const snapshot = snapshots.find((item) => item.snapshotId === snapshotId);
  if (!snapshot) return;
  const latest = snapshots.at(-1);
  const diff = latest && latest.snapshotId !== snapshot.snapshotId ? compareSnapshots(snapshot, latest) : null;
  $('#snapshotEyebrowV03').textContent = `V${snapshot.sequence} · ${snapshot.parentSnapshotIds.length ? 'VARIANT' : 'ROOT'}`;
  $('#snapshotTitleV03').textContent = snapshot.question;
  $('#snapshotBodyV03').innerHTML = `<div class="v03-snapshot-grid">
    <section><strong>Decision</strong><p>${escapeHtml(snapshot.decision.conclusion)}</p><small>${escapeHtml(snapshot.decision.status)} · ${Math.round(snapshot.decision.confidence * 100)}%</small></section>
    <section><strong>Claims</strong><ul>${snapshot.claims.map((claim) => `<li>${escapeHtml(claim.text)}</li>`).join('') || '<li>No claims</li>'}</ul></section>
    <section><strong>Open gaps</strong><ul>${snapshot.gaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join('') || '<li>None recorded</li>'}</ul></section>
    ${diff ? `<section><strong>Replay to latest</strong><p>${diff.documents.changed.length + diff.documents.added.length + diff.documents.removed.length} document change(s); ${diff.claims.changed.length + diff.claims.added.length + diff.claims.removed.length} claim change(s); evidence set ${diff.evidenceSetChanged ? 'changed' : 'unchanged'}.</p></section>` : ''}
    <section><strong>Integrity</strong><div class="v03-hash">snapshot ${escapeHtml(snapshot.snapshotSha256)}</div><div class="v03-hash">evidence ${escapeHtml(snapshot.evidenceSetSha256)}</div></section>
  </div>`;
  $('#branchSnapshotV03').onclick = () => {
    branchParentOverride = snapshot.snapshotId;
    $('#snapshotDialogV03').close();
    const status = $('#statusbar')?.firstElementChild;
    if (status) status.innerHTML = '<i class="pulse"></i> Next grounded run will branch from the selected snapshot';
  };
  $('#snapshotDialogV03').showModal();
}

async function buildGraphManifest(snapshots) {
  const idsUsedAsParents = new Set(snapshots.flatMap((snapshot) => snapshot.parentSnapshotIds || []));
  const records = snapshots.map((snapshot) => ({
    snapshotId: snapshot.snapshotId,
    snapshotSha256: snapshot.snapshotSha256,
    parentSnapshotIds: snapshot.parentSnapshotIds,
  }));
  const payload = {
    contractVersion: 'research-version-graph/v1-browser',
    workspaceId: WORKSPACE_ID,
    roots: snapshots.filter((snapshot) => !snapshot.parentSnapshotIds.length).map((snapshot) => snapshot.snapshotId),
    heads: snapshots.filter((snapshot) => !idsUsedAsParents.has(snapshot.snapshotId)).map((snapshot) => snapshot.snapshotId),
    snapshots: records,
  };
  return { ...payload, graphSha256: await sha256(stableJson(payload)) };
}
function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
async function exportGovernedHandoff() {
  await persistCurrentBrief('handoff-snapshot');
  const snapshots = await listSnapshots();
  const latest = snapshots.at(-1);
  if (!latest) return;
  const graph = await buildGraphManifest(snapshots);
  const payload = {
    contractVersion: 'agent-work-os/research-handoff/v1',
    researchVersionGraphContract: graph.contractVersion,
    workspaceId: WORKSPACE_ID,
    handoffId: uid('handoff'),
    createdAt: new Date().toISOString(),
    source: {
      snapshotId: latest.snapshotId,
      snapshotSha256: latest.snapshotSha256,
      graphSha256: graph.graphSha256,
      evidenceSetSha256: latest.evidenceSetSha256,
      semanticGate: latest.semanticGate,
    },
    research: {
      question: latest.question,
      mode: latest.mode,
      acceptedConclusion: latest.decision.conclusion,
      status: latest.decision.status,
      confidence: latest.decision.confidence,
      claimIds: latest.claims.map((claim) => claim.claimId),
      openGaps: latest.gaps,
      nextMoves: latest.brief?.nextMoves || [],
    },
    requestedOutcome: 'implementation-plan',
    constraints: ['Preserve evidence provenance', 'Do not claim deployment without an exact-SHA verification receipt'],
    executionPolicy: {
      evidencePolicy: 'verified-or-explicitly-unverified',
      networkPolicy: 'bounded',
      approvalGates: ['billing_change', 'credential_change', 'external_write', 'merge', 'production_deploy'],
      autoAdvanceAllowed: true,
      irreversibleActionsRequireApproval: true,
    },
  };
  const handoff = { ...payload, handoffSha256: await sha256(stableJson(payload)), versionGraph: graph };
  download('agent-work-os-research-handoff-v1.json', JSON.stringify(handoff, null, 2));
}

function scheduleCapture(reason) {
  clearTimeout(captureTimer);
  captureTimer = setTimeout(() => persistCurrentBrief(reason).catch(console.error), 180);
}

async function initV03() {
  injectUi();
  await renderVersionHistory();
  const latest = await latestSnapshot();
  lastObservedFingerprint = latest?.briefFingerprint || '';

  const observed = $('#briefPanel');
  if (observed) {
    const observer = new MutationObserver(() => scheduleCapture('research-run'));
    observer.observe(observed, { subtree: true, childList: true, characterData: true });
  }
  const newVariant = $('#newVariant');
  if (newVariant) newVariant.addEventListener('click', async () => {
    const current = await latestSnapshot();
    if (current) branchParentOverride = current.snapshotId;
  });
  const wipe = $('#wipeData');
  if (wipe) wipe.addEventListener('click', () => setTimeout(async () => {
    if (!(await readNotebookDocuments()).length && !localStorage.getItem('research-ledger:last-brief')) {
      await historyClear();
      lastObservedFingerprint = '';
      await renderVersionHistory();
    }
  }, 350));

  if (localStorage.getItem('research-ledger:last-brief') && !latest) scheduleCapture('migration-v0.2');
}

initV03().catch((error) => console.error('Research Ledger v0.3 history init failed', error));
