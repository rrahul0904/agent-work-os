import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { authorizeWorkspace, canExecuteShipping } from "../src/workspace-scope.js";

test("production daemon refuses any agent filesystem access without operator-provisioned roots",async()=>{
  await assert.rejects(authorizeWorkspace("/tmp",{mode:"production",roots:[]}),/ROOTS_REQUIRED/);
  await assert.rejects(authorizeWorkspace("relative/path",{mode:"production",roots:["/tmp"]}),/ABSOLUTE_PATH_REQUIRED/);
  await assert.rejects(authorizeWorkspace("/does-not-exist",{mode:"production",roots:["/tmp"]}),/PATH_NOT_FOUND/);
  assert.equal(canExecuteShipping({NODE_ENV:"production"}),false);
  assert.equal(canExecuteShipping({NODE_ENV:"production",AGENT_WORK_OS_SHIPPING_EXECUTION_APPROVED:"true"}),true);
  assert.equal(canExecuteShipping({NODE_ENV:"production",AGENT_WORK_OS_SHIPPING_EXECUTION_APPROVED:"TRUE"}),false);
});
test("realpath scope rejects symlinks into outside, sibling-prefix collisions and filesystem root allowlists",async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),"awos-scope-"));
  const allowed=path.join(temp,"project");
  const outside=path.join(temp,"project-other");
  const link=path.join(allowed,"link");
  try{
    await fs.mkdir(path.join(allowed,"repo"),{recursive:true});
    await fs.mkdir(outside);
    await fs.symlink(outside,link,"dir");
    assert.equal(await authorizeWorkspace(path.join(allowed,"repo"),{
      mode:"production",roots:[allowed]}),await fs.realpath(path.join(allowed,"repo")));
    await assert.rejects(authorizeWorkspace(outside,{mode:"production",roots:[allowed]}),/OUTSIDE_OPERATOR_SCOPE/);
    await assert.rejects(authorizeWorkspace(link,{mode:"production",roots:[allowed]}),/OUTSIDE_OPERATOR_SCOPE/);
    await assert.rejects(authorizeWorkspace(allowed,{mode:"production",roots:[path.parse(allowed).root]}),/OUTSIDE_OPERATOR_SCOPE/);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});
test("test fixtures remain usable without a production root policy",async()=>{
  assert.equal(await authorizeWorkspace("/tmp",{mode:"test",roots:[]}),path.resolve("/tmp"));
});
