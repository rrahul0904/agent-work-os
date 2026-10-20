import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, lstat, symlink, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compileRecipe, validateRecipe, writeRecipeFiles} from '../src/stack-recipe.js';

const recipe=()=>({
  schema:'stack-recipe/v1',id:'demo-product',name:'Demo Product',
  surfaces:['api','web','cli'],modules:['status'],
  sourceEvidence:[{url:'https://profullstack.com/stack/build'}],
  releasePolicy:'dry-run-only'
});

test('deterministic generation and manifests',()=>{
 const one=compileRecipe(recipe());
 const two=compileRecipe({...recipe(),surfaces:['cli','web','api']});
 assert.deepEqual(one,two);
 assert.equal(one.manifest.verification,'NOT_RUN');
 assert.equal(one.manifest.release,'NOT_DEPLOYED');
 assert.equal(one.manifest.files.length>6,true);
});

test('unsupported operations fail closed',()=>{
 for(const surface of ['mobile','desktop','mcp','tui'])
  assert.throws(()=>validateRecipe({...recipe(),surfaces:['api',surface]}),/not implemented/);
 assert.throws(()=>validateRecipe({...recipe(),modules:['coinpay']}),/status module/);
 assert.throws(()=>validateRecipe({...recipe(),surfaces:['web']}),/web requires api/);
 assert.throws(()=>validateRecipe({...recipe(),id:'../bad'}),/invalid id/);
 assert.throws(()=>validateRecipe({...recipe(),releasePolicy:'deploy'}),/dry-run-only/);
 assert.throws(()=>validateRecipe({...recipe(),sourceEvidence:[{url:'file:///etc/passwd'}]}),/invalid evidence/);
});

test('dry-run does not mutate filesystem',async()=>{
 const root=await mkdtemp(join(tmpdir(),'recipe-'));
 const result=await writeRecipeFiles(root,recipe(),{dryRun:true});
 assert.equal(result.written,false);
 await assert.rejects(lstat(join(root,'demo-product')),/ENOENT/);
});

test('new output directory only; refuse symlinks and overwrite',async()=>{
 const root=await mkdtemp(join(tmpdir(),'recipe-'));
 const result=await writeRecipeFiles(root,recipe());
 assert.equal(result.written,true);
 await assert.rejects(writeRecipeFiles(root,recipe()),/EEXIST/);
 await symlink(root,join(root,'link'));
 await assert.rejects(writeRecipeFiles(join(root,'link'),{...recipe(),id:'other-demo'}),/symlink/);
 assert.equal(JSON.parse(await readFile(join(result.destination,'shipping/plan.json'),'utf8')).providerWritesAllowed,false);
});

test('actual generated app passes tests and CLI',async()=>{
 const root=await mkdtemp(join(tmpdir(),'recipe-'));
 const {destination}=await writeRecipeFiles(root,recipe());
 const tests=spawnSync(process.execPath,['--test','test/core.test.mjs','test/server.test.mjs'],{cwd:destination,encoding:'utf8',timeout:15000});
 assert.equal(tests.status,0,tests.stdout+'\n'+tests.stderr);
 const cli=spawnSync(process.execPath,['src/cli.mjs','status'],{cwd:destination,encoding:'utf8',timeout:10000});
 assert.equal(cli.status,0,cli.stderr);
 assert.equal(JSON.parse(cli.stdout).productId,'demo-product');
 const web=await readFile(join(destination,'public/index.html'),'utf8');
 assert.match(web,/Demo Product/);
});

test('html injection is escaped',()=>{
 const rendered=compileRecipe({...recipe(),name:'Bad <script>alert(1)</script>'}).files['public/index.html'];
 assert.equal(rendered.includes('<script>alert'),false);
 assert.equal(rendered.includes('&lt;script&gt;'),true);
});


test('surface-specific entrypoints exist only when supported',async()=>{
 const onlyCli={...recipe(),surfaces:['cli']};
 const cliFiles=compileRecipe(onlyCli).files;
 assert.equal(JSON.parse(cliFiles['package.json']).scripts.start,undefined);
 assert.equal(typeof JSON.parse(cliFiles['package.json']).scripts.status,'string');
 assert.equal('src/server.mjs' in cliFiles,false);
 const root=await mkdtemp(join(tmpdir(),'recipe-'));
 const output=await writeRecipeFiles(root,onlyCli);
 const run=spawnSync(process.execPath,['--test','test/core.test.mjs'],{cwd:output.destination,encoding:'utf8',timeout:10000});
 assert.equal(run.status,0,run.stderr);
 const onlyApi=compileRecipe({...recipe(),surfaces:['api']});
 assert.equal(JSON.parse(onlyApi.files['package.json']).scripts.status,undefined);
 assert.equal('src/cli.mjs' in onlyApi.files,false);
 assert.equal('public/index.html' in onlyApi.files,false);
});
