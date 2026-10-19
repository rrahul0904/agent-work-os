const DB_NAME = 'research-ledger-history';
const DB_VERSION = 1;
const SNAPSHOT_STORE = 'snapshots';
const WORKSPACE_ID = 'research-ledger-local';

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
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function snapshots() {
  const db = await openDb();
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
    const request = tx.objectStore(SNAPSHOT_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result.sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt));
}
async function graphFor(history) {
  const parentIds = new Set(history.flatMap((snapshot) => snapshot.parentSnapshotIds || []));
  const payload = {
    contractVersion: 'research-version-graph/v1',
    workspaceId: WORKSPACE_ID,
    roots: history.filter((snapshot) => !(snapshot.parentSnapshotIds || []).length).map((snapshot) => snapshot.snapshotId).sort(),
    heads: history.filter((snapshot) => !parentIds.has(snapshot.snapshotId)).map((snapshot) => snapshot.snapshotId).sort(),
    snapshots: history.map((snapshot) => ({
      snapshotId: snapshot.snapshotId,
      snapshotSha256: snapshot.snapshotSha256,
      parentSnapshotIds: [...(snapshot.parentSnapshotIds || [])].sort(),
    })),
  };
  return { ...payload, graphSha256: await sha256(stableJson(payload)) };
}
function download(name, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function exportCanonicalHandoff() {
  const history = await snapshots();
  const latest = history.at(-1);
  if (!latest) return;
  const graph = await graphFor(history);
  const nextMoves = [...new Set(latest.brief?.nextMoves || [])].sort();
  const payload = {
    contractVersion: 'agent-work-os/research-handoff/v1',
    researchVersionGraphContract: 'research-version-graph/v1',
    workspaceId: WORKSPACE_ID,
    handoffId: uid('handoff'),
    source: {
      snapshotId: latest.snapshotId,
      snapshotSha256: latest.snapshotSha256,
      graphSha256: graph.graphSha256,
      replaySha256: null,
      evidenceSetSha256: latest.evidenceSetSha256,
      semanticGate: latest.semanticGate || 'SEMANTIC_EVIDENCE_UNVERIFIED',
    },
    research: {
      question: latest.question,
      mode: latest.mode,
      acceptedConclusion: latest.decision.conclusion,
      status: latest.decision.status,
      confidence: latest.decision.confidence,
      claimIds: [...new Set((latest.claims || []).map((claim) => claim.claimId))].sort(),
      openGaps: [...new Set(latest.gaps || [])].sort(),
      nextMoves,
    },
    requestedOutcome: 'implementation-plan',
    constraints: [
      'Do not claim deployment without an exact-SHA verification receipt',
      'Preserve evidence provenance',
    ].sort(),
    executionPolicy: {
      evidencePolicy: 'verified-or-explicitly-unverified',
      networkPolicy: 'bounded',
      approvalGates: ['billing_change', 'credential_change', 'external_write', 'merge', 'production_deploy'],
      autoAdvanceAllowed: true,
      irreversibleActionsRequireApproval: true,
    },
  };
  const handoff = { ...payload, handoffSha256: await sha256(stableJson(payload)) };
  download('agent-work-os-research-handoff-package-v1.json', {
    contractVersion: 'agent-work-os/research-handoff-package/v1',
    exportedAt: new Date().toISOString(),
    handoff,
    versionGraph: graph,
    snapshots: history,
  });
}

function bindCanonicalExport() {
  const handoff = document.querySelector('#handoff');
  const secondary = document.querySelector('#exportHandoffV03');
  if (handoff) handoff.onclick = exportCanonicalHandoff;
  if (secondary) secondary.onclick = exportCanonicalHandoff;
}

bindCanonicalExport();
