#!/usr/bin/env node
import pg from "pg";
import fs from "node:fs/promises";
import { IdentityRepository } from "../services/control-api/src/identity-store.js";
import { bootstrapFirstOwner } from "../services/control-api/src/bootstrap-first-owner.js";

const vars = process.env;
const passwordFile=vars.AGENT_WORK_OS_BOOTSTRAP_PASSWORD_FILE;
let password=vars.AGENT_WORK_OS_BOOTSTRAP_PASSWORD;
if(passwordFile){
  const stat=await fs.stat(passwordFile);
  if(!stat.isFile() || (stat.mode & 0o077)!==0)
    throw new Error("bootstrap_password_file_must_be_regular_private_0600");
  password=(await fs.readFile(passwordFile,"utf8")).trimEnd();
}
if(!vars.DATABASE_URL || !password ||
   vars.AGENT_WORK_OS_BOOTSTRAP_APPROVAL!=="YES_CREATE_FIRST_OWNER"){
  console.error("Missing DATABASE_URL, private bootstrap password, or explicit first-owner approval.");
  process.exitCode=2;
}else{
  const pool=new pg.Pool({connectionString:vars.DATABASE_URL,max:4,connectionTimeoutMillis:6000});
  try{
    const identities=new IdentityRepository(pool);
    await identities.initialize();
    const result=await bootstrapFirstOwner({
      pool,identities,email:vars.AGENT_WORK_OS_BOOTSTRAP_EMAIL,
      password,organizationName:vars.AGENT_WORK_OS_BOOTSTRAP_ORGANIZATION,
      approval:vars.AGENT_WORK_OS_BOOTSTRAP_APPROVAL
    });
    // Credential and the created session token never leave this process.
    console.log(JSON.stringify({status:"FIRST_OWNER_CREATED",organizationId:result.organizationId,userId:result.userId}));
  }catch(error){
    console.error(error.message?.startsWith("FIRST_OWNER_")?error.message:"FIRST_OWNER_BOOTSTRAP_FAILED");
    process.exitCode=1;
  }finally{password=undefined;await pool.end();}
}
