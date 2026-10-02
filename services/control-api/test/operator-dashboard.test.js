import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const appPath=path.join(root,'apps/web/public/app.js');
const cssPath=path.join(root,'apps/web/public/styles.css');

function read(file){return fs.readFileSync(file,'utf8')}

test('operator browser bundle is valid JavaScript',()=>{
  const result=spawnSync(process.execPath,['--check',appPath],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
});

test('operations atlas preserves observable-count and RE-370 controls',()=>{
  const source=read(appPath);
  for(const marker of ['function atlasHtml','function workspaceGroups','OBSERVED EVENTS','ACTIVITY BOARD','RECENT CHANGE STREAM','Brain handoff ID','verified-context']) assert.match(source,new RegExp(marker));
  assert.doesNotMatch(source,/productivity score[^<]{0,40}>\s*\d/i);
});

test('operations atlas has responsive territory and dashboard styles',()=>{
  const css=read(cssPath);
  for(const marker of ['.atlasGrid','.territory','.metricGrid','.dashboardSplit','@media(max-width:520px)']) assert.ok(css.includes(marker),`missing ${marker}`);
});
