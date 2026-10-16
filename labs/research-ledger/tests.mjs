import assert from 'node:assert/strict';
import handler from './api/research.js';

function invoke(method,body){
  return new Promise((resolve,reject)=>{
    const req={method,body};
    const res={code:200,status(n){this.code=n;return this},json(payload){resolve({status:this.code,payload})}};
    Promise.resolve(handler(req,res)).catch(reject);
  });
}

const original=process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY;
const get=await invoke('GET');
assert.equal(get.status,200);
assert.equal(get.payload.live,false);
const post=await invoke('POST',{task:'research',question:'What does this say?',evidence:[{id:'D1.C1',title:'Doc',text:'Evidence text'}]});
assert.equal(post.status,503);
assert.match(post.payload.error,/not configured/i);
const bad=await invoke('POST',{task:'research',question:''});
assert.equal(bad.status,503); // provider guard happens before validation in local-only mode
if(original) process.env.OPENAI_API_KEY=original;
console.log('research-ledger API smoke tests passed');
