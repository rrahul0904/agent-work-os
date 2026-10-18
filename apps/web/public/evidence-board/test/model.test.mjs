import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyBoard, validateBoard, importBoard, exportBoard, applyBoardAction, MAX_IMPORT_BYTES } from '../model.mjs'

function note(id = 'n1', overrides = {}) {
  return { id, type: 'note', title: 'Note', body: 'Text', x: 10, y: 20,
    confidence: 'unknown', sourceRefs: [], ...overrides }
}
function edge(id = 'e1', from = 'n1', to = 'n2') {
  return { id, from, to, relation: 'supports', label: '', sourceRefs: [] }
}
const action = (board, a) => applyBoardAction(board, a)
test('empty and portable export/import preserve canonical fields', () => {
  const b = action(emptyBoard(), { type: 'add-node', node: note() })
  const restored = importBoard(exportBoard(b))
  assert.deepEqual(restored, b)
  assert.equal(restored.revision, 1)
})
test('reject duplicate IDs, unresolved graph endpoints and self edges', () => {
  const b = emptyBoard()
  assert.throws(() => validateBoard({ ...b, nodes: [note(), note()] }), /duplicate node/)
  assert.throws(() => validateBoard({ ...b, nodes: [note()], edges: [edge()] }), /dangling/)
  assert.throws(() => validateBoard({ ...b, nodes: [note()], edges: [edge('e1', 'n1', 'n1')] }), /self/)
})
test('cannot assert observed without a source reference', () => {
  assert.throws(() => validateBoard({ ...emptyBoard(), nodes: [note('n1', { confidence: 'observed' })] }), /requires a source/)
  const verified = validateBoard({ ...emptyBoard(), nodes: [note('n1', { confidence: 'observed', sourceRefs: ['repo://commit/abc'] })] })
  assert.equal(verified.nodes[0].confidence, 'observed')
})
test('remove node cascades its edges while leaving unrelated nodes', () => {
  let b = emptyBoard()
  b = action(b, { type: 'add-node', node: note() })
  b = action(b, { type: 'add-node', node: note('n2') })
  b = action(b, { type: 'add-edge', edge: edge() })
  b = action(b, { type: 'remove-node', id: 'n1' })
  assert.deepEqual(b.nodes.map(n => n.id), ['n2'])
  assert.equal(b.edges.length, 0)
})
test('malformed and oversized import fails closed', () => {
  assert.throws(() => importBoard('{'), /malformed JSON/)
  assert.throws(() => importBoard(' '.repeat(MAX_IMPORT_BYTES + 1)), /import size/)
  assert.throws(() => importBoard(JSON.stringify({ ...emptyBoard(), schema: 'evidence-board/v99' })), /unsupported schema/)
})
test('raw HTML is retained only as inert data for textContent rendering', () => {
  const b = action(emptyBoard(), { type: 'add-node', node: note('n1', { body: '<img src=x onerror=alert(1)>' }) })
  assert.equal(importBoard(exportBoard(b)).nodes[0].body, '<img src=x onerror=alert(1)>')
})
test('prototype pollution shaped JSON is not spread to canonical output', () => {
  const evil = '{"schema":"evidence-board/v1","id":"b","title":"safe","revision":0,"viewport":{"x":0,"y":0,"zoom":1},"nodes":[],"edges":[],"__proto__":{"evil":true}}'
  const restored = importBoard(evil)
  assert.equal(Object.hasOwn(restored, '__proto__'), false)
  assert.equal({}.evil, undefined)
})
test('reject bad values and nonsensical graph operations', () => {
  const b = emptyBoard()
  assert.throws(() => action(b, { type: 'move-node', id: 'missing', x: 1, y: 2 }), /missing node/)
  assert.throws(() => action(b, { type: 'foobar' }), /unknown action/)
  assert.throws(() => validateBoard({ ...b, viewport: { x: NaN, y: 0, zoom: 1 } }), /viewport x/)
  assert.throws(() => validateBoard({ ...b, nodes: [note('n1', { x: Infinity })] }), /node x/)
  assert.throws(() => action(b, { type: 'add-node', node: note('n1', { confidence: 'fake' }) }), /confidence/)
})
test('mutations remain immutable with monotonically increasing revision', () => {
  const b = emptyBoard(), b2 = action(b, { type: 'rename', title: 'Roadmap' })
  assert.equal(b.title, 'Untitled evidence board')
  assert.equal(b2.title, 'Roadmap')
  assert.equal(b2.revision, b.revision + 1)
})
