import assert from 'node:assert/strict';
import handler from './api/research.js';
function invoke(method,body){return new Promise((resolve,reject)=>{const req={method,body},res={code:200,status(n){this.code=n;return this},json(payload){resolve({status:this.code,payload})}};Promise.resolve(handler(req,res)).catch(reject)})}
const key=process.env.OPENAI_API_KEY,model=process.env.OPENAI_MODEL;delete process.env.OPENAI_API_KEY;delete process.env.OPENAI_MODEL;
const get=await invoke('GET');assert.equal(get.status,200);assert.equal(get.payload.live,false);
const post=await invoke('POST',{task:'research',question:'What does this say?',evidence:[{id:'D1.C1',title:'Doc',text:'Evidence'}]});assert.equal(post.status,503);assert.match(post.payload.error,/not configured/i);
if(key)process.env.OPENAI_API_KEY=key;if(model)process.env.OPENAI_MODEL=model;console.log('research-ledger v0.2 API smoke tests passed');
