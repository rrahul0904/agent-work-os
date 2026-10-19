import assert from 'node:assert/strict';
import { NOTEBOOK_SCHEMA, validateNotebook, replaceNotebookStores } from './notebook-contract.js';

const source = {schema: NOTEBOOK_SCHEMA, notebook:{name:'Restored'}, documents:[{id:'D1',text:'Some research'}],captures:[{id:'C1',text:'A source'}],snapshots:[{id:'S1',brief:{question:'Why?'}}]};
const valid = validateNotebook(source);
assert.equal(valid.documents.length,1);
for (const mutation of [
  {...source, schema:'unknown'},
  {...source, documents:[{id:'D1',text:'ok'},{id:'D1',text:'duplicate'}]},
  {...source, captures:[{id:'C1',text:45}]},
  {...source, snapshots:[{id:'S1',brief:'not an object'}]},
  {...source, captures:Array.from({length:101},(_,i)=>({id:'C'+i,text:'x'}))}
]) assert.throws(()=>validateNotebook(mutation));

function fakeDatabase(failAt = '') {
  const persisted = {documents:[{id:'oldDoc',text:'keep me'}],captures:[],snapshots:[]};
  return {
    persisted,
    transaction(names,mode) {
      assert.deepEqual(names,['documents','captures','snapshots']);
      assert.equal(mode,'readwrite');
      const work=structuredClone(persisted);
      const tx={
        error:null,oncomplete:null,onabort:null,onerror:null,
        objectStore(name){
          return {
            clear(){work[name]=[]},
            put(value){if (name===failAt) throw new Error('simulated storage failure');work[name].push(value)}
          };
        },
        abort(){queueMicrotask(()=>tx.onabort?.())}
      };
      queueMicrotask(()=>{ if(!tx.aborted){ for(const name of names) persisted[name]=work[name]; tx.oncomplete?.(); }});
      const oldAbort=tx.abort;
      tx.abort=()=>{tx.aborted=true;oldAbort()};
      return tx;
    }
  };
}
const ok=fakeDatabase();
await replaceNotebookStores(ok,valid);
assert.equal(ok.persisted.documents[0].id,'D1');
assert.equal(ok.persisted.captures[0].id,'C1');
const bad=fakeDatabase('captures');
await assert.rejects(replaceNotebookStores(bad,valid),/simulated|aborted/);
assert.equal(bad.persisted.documents[0].id,'oldDoc','failed import must not erase existing documents');
console.log('research-ledger atomic notebook contract tests passed');
