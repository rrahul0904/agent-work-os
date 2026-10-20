import test from 'node:test';
import assert from 'node:assert/strict';
import {reorderPage} from './reading-order.mjs';
const block=(id,x0,y0,x1,y1,kind='text')=>({id,text:'exact:'+id,x0,y0,x1,y1,kind});
const page=blocks=>({width:600,height:800,page:3,blocks});
const ids=result=>result.blocks.map(b=>b.id);
test('two-column reading order and exact source anchors',()=>{
  const p=page([block('r1',330,70,570,90),block('l2',30,120,270,140),block('r2',330,120,570,140),block('l1',30,70,270,90)]);
  const result=reorderPage(p);
  assert.equal(result.mode,'two-column');
  assert.deepEqual(ids(result),['l1','l2','r1','r2']);
  assert.equal(result.blocks[0].text,'exact:l1');
  assert.deepEqual(result.blocks[0].source,{page:3,id:'l1',bbox:[30,70,270,90]});
});
test('spanning heading precedes body and break separates bands',()=>{
 const p=page([block('end',40,340,560,365,'heading'),block('r2',330,220,560,240),block('l2',30,220,270,240),block('title',40,10,560,40,'heading'),block('r1',330,90,560,110),block('l1',30,90,270,110)]);
 assert.deepEqual(ids(reorderPage(p)),['title','l1','l2','r1','r2','end']);
});
test('single column top-to-bottom and no source mutation',()=>{
 const p=page([block('b',100,80,500,100),block('a',100,20,500,40)]);
 assert.deepEqual(ids(reorderPage(p)),['a','b']);
 assert.deepEqual(p.blocks[0],block('b',100,80,500,100));
});
test('no speculative deletion of headers or footers',()=>{
 const p=page([block('header',30,2,570,16),block('l1',30,70,270,90),block('l2',30,110,270,130),block('r1',330,70,570,90),block('r2',330,110,570,130),block('footer',30,780,570,798)]);
 assert.deepEqual(ids(reorderPage(p)),['header','l1','l2','r1','r2','footer']);
});
test('reject duplicate IDs, invalid geometry, unknown kinds, nontext',()=>{
 assert.throws(()=>reorderPage(page([block('dup',0,0,20,20),block('dup',0,40,20,60)])),TypeError);
 assert.throws(()=>reorderPage(page([block('outside',0,0,601,20)])),TypeError);
 assert.throws(()=>reorderPage(page([block('bad',0,0,10,10,'secret')])),TypeError);
 assert.throws(()=>reorderPage(page([{...block('bad',0,0,10,10),text:123}])),TypeError);
});
test('empty page returns empty',()=>assert.deepEqual(reorderPage(page([])),{blocks:[],mode:'empty',coverage:1}));
test('formula, table, figure retain content and roles',()=>{
 const p=page([block('l1',30,90,270,110),block('l2',30,130,270,150,'formula'),block('r1',330,90,570,110,'figure'),block('r2',330,130,570,150,'table')]);
 const ordered=reorderPage(p);
 assert.deepEqual(ordered.blocks.map(b=>b.kind),['text','formula','figure','table']);
 assert.equal(ordered.blocks.length,p.blocks.length);
});
