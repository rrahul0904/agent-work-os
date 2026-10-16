import assert from 'node:assert/strict';
import researchHandler from './api/research.js';
import sourceStatusHandler,{validatePublicHttpUrl} from './api/source-status.js';

function invoke(handler,method,body){return new Promise((resolve,reject)=>{const req={method,body};const res={code:200,status(n){this.code=n;return this},json(payload){resolve({status:this.code,payload})}};Promise.resolve(handler(req,res)).catch(reject)})}
const originalKey=process.env.OPENAI_API_KEY,originalModel=process.env.OPENAI_MODEL;delete process.env.OPENAI_API_KEY;delete process.env.OPENAI_MODEL;
const get=await invoke(researchHandler,'GET');assert.equal(get.status,200);assert.equal(get.payload.live,false);
const post=await invoke(researchHandler,'POST',{task:'research',question:'What does this say?',evidence:[{id:'D1.C1',title:'Doc',text:'Evidence text'}]});assert.equal(post.status,503);assert.match(post.payload.error,/not configured/i);
const status=await invoke(sourceStatusHandler,'GET');assert.equal(status.status,200);assert.equal(status.payload.maxUrls,8);
assert.equal(validatePublicHttpUrl('https://example.com/a').hostname,'example.com');
for(const bad of ['file:///etc/passwd','http://localhost/x','http://127.0.0.1/x','http://10.0.0.1/x','http://192.168.1.1/x','http://user:pass@example.com/x'])assert.throws(()=>validatePublicHttpUrl(bad));
const empty=await invoke(sourceStatusHandler,'POST',{urls:[]});assert.equal(empty.status,400);
if(originalKey)process.env.OPENAI_API_KEY=originalKey;if(originalModel)process.env.OPENAI_MODEL=originalModel;
console.log('research-ledger v0.3 API/security smoke tests passed');
