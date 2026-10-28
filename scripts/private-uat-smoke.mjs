#!/usr/bin/env node
import assert from "node:assert/strict";
const base="http://127.0.0.1:8787";
const password=process.env.AGENT_WORK_OS_BOOTSTRAP_PASSWORD;
const email=process.env.AGENT_WORK_OS_BOOTSTRAP_EMAIL;
const action=process.argv[2];
if(!email||!password||!["seed","verify"].includes(action)){
  console.error("private UAT requires operator test credentials and seed/verify mode");
  process.exit(2);
}
async function request(path,{method="GET",body,cookie="",csrf=""}={}){
  const response=await fetch(base+path,{method,redirect:"manual",
    headers:{
      ...(body?{"content-type":"application/json"}:{}),
      ...(cookie?{cookie}:{}),
      ...(csrf?{"x-csrf-token":csrf}:{})
    },...(body?{body:JSON.stringify(body)}:{})
  });
  const data=await response.json().catch(()=>({}));
  return {status:response.status,data,
    cookies:response.headers.getSetCookie().map(x=>x.split(";")[0]).join("; ")};
}
const health=await request("/readyz");
assert.equal(health.status,200,"PostgreSQL and event fanout must be ready");
const client=await request("/api/client-config");
assert.equal(client.data.authentication,"account");
assert.equal(client.data.registrationEnabled,false,"public production registration is disabled");
const wrong=await request("/api/auth/register",{method:"POST",body:{
  email:"uninvited@invalid.test",password:"invalid-prod-signup",organizationName:"Unapproved"
}});
assert.equal(wrong.status,403,"unauthorized signups are denied");
const login=await request("/api/auth/login",{method:"POST",body:{email,password}});
assert.equal(login.status,200,"bootstrap owner can authenticate");
assert.ok(login.cookies.includes("awos_session="));
assert.ok(login.data.csrfToken);
const organizationId=login.data.memberships[0].organizationId;
const auth={cookie:login.cookies,csrf:login.data.csrfToken};
if(action==="seed"){
  const project=await request("/api/projects",{method:"POST",body:{
    organizationId,name:"Production UAT persisted project",
    description:"Disposable UAT record for safe cold restart"
  },...auth});
  assert.equal(project.status,201,"tenant project creation is durably persisted");
  const viewerEmail="invited-uat-"+Date.now()+"@invalid.test";
  const invitation=await request("/api/organizations/"+organizationId+"/invitations",{
    method:"POST",body:{email:viewerEmail,role:"viewer"},...auth
  });
  assert.equal(invitation.status,201,"owner can invite");
  const invitationToken=invitation.data.invitation?.token;
  assert.match(invitationToken,/^[0-9a-f]{64}$/);
  const invited=await request("/api/auth/register-invited",{method:"POST",body:{
    email:viewerEmail,password:password+"-member",invitationToken
  }});
  assert.equal(invited.status,201,"invited user can join with open registration disabled");
  assert.equal(invited.data.memberships[0].role,"viewer");
  const forbidden=await request("/api/projects",{method:"POST",body:{
    organizationId,name:"Unauthorized viewer edit"
  },cookie:invited.cookies,csrf:invited.data.csrfToken});
  assert.equal(forbidden.status,403,"viewer cannot write project");
  const replay=await request("/api/auth/register-invited",{method:"POST",body:{
    email:viewerEmail,password:password+"-member",invitationToken
  }});
  assert.equal(replay.status,404,"invite token is single-use");
  console.log("PRIVATE_UAT_SEED_PASS: bootstrapped owner, restricted signup, project write, invite, viewer denial");
}else{
  const projects=await request("/api/projects?organizationId="+encodeURIComponent(organizationId),auth);
  assert.equal(projects.status,200);
  assert.ok(projects.data.projects.some(p=>p.name==="Production UAT persisted project"),
    "project must survive control plane container restart");
  console.log("PRIVATE_UAT_RESTART_PASS: owner login, tenant persisted project and healthy database");
}
