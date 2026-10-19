#!/usr/bin/env node
import {readFile,writeFile,chmod} from "node:fs/promises";
import path from "node:path";
import {compileContext,priceSession,proposeLocalEdit,applyApprovedEdit,undoApprovedEdit} from "./index.js";
const [verb,...args]=process.argv.slice(2);
const json=async(file)=>JSON.parse(await readFile(path.resolve(file),"utf8"));
const need=n=>{if(args.length<n||args.slice(0,n).some(x=>!x))throw Error("missing_required_arguments");};
try{
  let result;
  if(verb==="analyze"){
    need(3);
    const input=await json(args[0]);
    result=compileContext({sources:input.sources,scope:args[1],budgetBytes:Number(args[2]),task:input.task??""});
  }else if(verb==="price"){
    need(1);result=priceSession(await json(args[0]));
  }else if(verb==="plan-edit"){
    need(4);
    const [root,relativePath,replacement,proposalFile]=args;
    const plan=await proposeLocalEdit({root:path.resolve(root),relativePath,nextBytes:await readFile(replacement),allowPaths:[relativePath]});
    await writeFile(proposalFile,JSON.stringify(plan,null,2)+"\n",{flag:"wx",mode:0o600});
    await chmod(proposalFile,0o600);
    result={proposalFile:path.resolve(proposalFile),approvalDigest:plan.proposalDigest,previousDigest:plan.previousDigest,nextDigest:plan.nextDigest,requiresExplicitApproval:true};
  }else if(verb==="apply-edit"){
    need(2);if(!args[1].startsWith("--approve-digest="))throw Error("explicit_approval_flag_required");
    result=await applyApprovedEdit(await json(args[0]),{approvalDigest:args[1].slice("--approve-digest=".length)});
  }else if(verb==="undo"){
    need(3);if(args[2]!=="--approve-undo")throw Error("explicit_undo_flag_required");
    result=await undoApprovedEdit({root:path.resolve(args[0]),txid:args[1],approveUndo:true});
  }else throw Error("Usage: cli.js analyze <source-fixture.json> <scope> <byte-budget> | price <usage-prices.json> | plan-edit <absolute-workspace-root> <relative-markdown-path> <replacement-file> <new-proposal.json> | apply-edit <proposal.json> --approve-digest=<digest> | undo <workspace-root> <txid> --approve-undo");
  process.stdout.write(JSON.stringify({ok:true,result},null,2)+"\n");
}catch(error){process.stderr.write(JSON.stringify({ok:false,error:error.code??error.message})+"\n");process.exitCode=1;}
