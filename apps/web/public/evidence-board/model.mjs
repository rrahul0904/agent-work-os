// Owned clean-room implementation. Independent of upstream Caseboard code.
export const SCHEMA = 'evidence-board/v1'
export const MAX_IMPORT_BYTES = 1_000_000
const TYPES = new Set(['note', 'source'])
const CONFIDENCE = new Set(['unknown', 'hypothesis', 'reported', 'observed'])
const RELATIONS = new Set(['related', 'supports', 'contradicts', 'depends'])
const ID = /^[A-Za-z0-9_-]{1,90}$/

function fail(message) { throw new Error('Invalid evidence board: ' + message) }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function id(value, name) { if (typeof value !== 'string' || !ID.test(value)) fail(name); return value }
function str(value, name, max = 8000) {
  if (typeof value !== 'string' || value.length > max) fail(name)
  return value
}
function num(value, name, max = 100000) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > max) fail(name)
  return value
}
function refs(value) {
  if (!Array.isArray(value) || value.length > 12) fail('sourceRefs')
  return value.map((s) => str(s, 'sourceRef', 500).trim()).filter(Boolean)
}
export function emptyBoard(boardId = 'board-local') {
  return { schema: SCHEMA, id: id(boardId, 'board id'), title: 'Untitled evidence board',
    revision: 0, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [] }
}
export function validateBoard(value) {
  if (!isObject(value) || value.schema !== SCHEMA) fail('unsupported schema')
  const v = value.viewport
  if (!isObject(v)) fail('viewport')
  const viewport = { x: num(v.x, 'viewport x'), y: num(v.y, 'viewport y'),
    zoom: num(v.zoom, 'viewport zoom', 3) }
  if (viewport.zoom < 0.2 || viewport.zoom > 3) fail('viewport zoom')
  if (!Array.isArray(value.nodes) || value.nodes.length > 400) fail('nodes')
  if (!Array.isArray(value.edges) || value.edges.length > 1200) fail('edges')
  const nodes = value.nodes.map((n) => {
    if (!isObject(n) || !TYPES.has(n.type)) fail('node type')
    const confidence = n.confidence ?? 'unknown'
    if (!CONFIDENCE.has(confidence)) fail('confidence')
    const sourceRefs = refs(n.sourceRefs ?? [])
    if (confidence === 'observed' && !sourceRefs.length) fail('observed node requires a source')
    return { id: id(n.id, 'node id'), type: n.type, title: str(n.title, 'node title', 150),
      body: str(n.body, 'node body'), x: num(n.x, 'node x'), y: num(n.y, 'node y'),
      confidence, sourceRefs }
  })
  const nodeIds = new Set(nodes.map((n) => n.id))
  if (nodeIds.size !== nodes.length) fail('duplicate node id')
  const edges = value.edges.map((e) => {
    if (!isObject(e) || !RELATIONS.has(e.relation)) fail('edge relation')
    const from = id(e.from, 'edge from'), to = id(e.to, 'edge to')
    if (from === to || !nodeIds.has(from) || !nodeIds.has(to)) fail('dangling/self edge')
    return { id: id(e.id, 'edge id'), from, to, relation: e.relation,
      label: str(e.label ?? '', 'edge label', 150), sourceRefs: refs(e.sourceRefs ?? []) }
  })
  if (new Set(edges.map((e) => e.id)).size !== edges.length) fail('duplicate edge id')
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) fail('revision')
  return { schema: SCHEMA, id: id(value.id, 'board id'),
    title: str(value.title, 'board title', 150), revision: value.revision,
    viewport, nodes, edges }
}
export function importBoard(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) fail('import size')
  let data
  try { data = JSON.parse(text) } catch { fail('malformed JSON') }
  return validateBoard(data)
}
export function exportBoard(board) { return JSON.stringify(validateBoard(board), null, 2) }
export function applyBoardAction(board, action) {
  const current = validateBoard(board)
  if (!isObject(action) || typeof action.type !== 'string') fail('action')
  let nodes = current.nodes, edges = current.edges, title = current.title, viewport = current.viewport
  switch (action.type) {
    case 'add-node':
      nodes = [...nodes, action.node]
      break
    case 'patch-node':
      if (!nodes.some((n) => n.id === action.id)) fail('missing node')
      nodes = nodes.map((n) => n.id === action.id ? { ...n, ...action.patch, id: n.id, type: n.type } : n)
      break
    case 'move-node':
      if (!nodes.some((n) => n.id === action.id)) fail('missing node')
      nodes = nodes.map((n) => n.id === action.id ? { ...n, x: action.x, y: action.y } : n)
      break
    case 'remove-node':
      if (!nodes.some((n) => n.id === action.id)) fail('missing node')
      nodes = nodes.filter((n) => n.id !== action.id)
      edges = edges.filter((e) => e.from !== action.id && e.to !== action.id)
      break
    case 'add-edge':
      edges = [...edges, action.edge]
      break
    case 'remove-edge':
      if (!edges.some((e) => e.id === action.id)) fail('missing edge')
      edges = edges.filter((e) => e.id !== action.id)
      break
    case 'rename':
      title = action.title
      break
    case 'viewport':
      viewport = action.viewport
      break
    default: fail('unknown action')
  }
  return validateBoard({ ...current, title, nodes, edges, viewport, revision: current.revision + 1 })
}
