#!/usr/bin/env node
/**
 * Actual Chromium + TLS + HttpOnly Secure cookie UAT against disposable Docker
 * Compose. User flows are driven through the rendered UI; no mocked fetch,
 * synthetic API responses, or live customer credentials.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = "https://localhost:8443";
const ownerEmail = process.env.AGENT_WORK_OS_BOOTSTRAP_EMAIL;
const ownerPassword = process.env.AGENT_WORK_OS_BOOTSTRAP_PASSWORD;
if(!ownerEmail || !ownerPassword) throw Error("PRIVATE_BROWSER_TEST_CREDENTIALS_REQUIRED");
let browser;
const errors=[];
try {
  browser=await chromium.launch({headless:true});
  const owner=await browser.newContext({ignoreHTTPSErrors:true});
  const page=await owner.newPage();
  page.on("pageerror",err=>errors.push("owner_js_"+String(err.message||"unknown").slice(0,120)));
  const first=await page.goto(url,{waitUntil:"domcontentloaded"});
  const bootstrapDiagnostic=await page.evaluate(async()=>{
    const response=await fetch("/api/client-config",{credentials:"same-origin",cache:"no-store"});
    const app=document.querySelector("#app");
    return {title:document.title,bodySize:document.body?.textContent?.length||0,
      appSample:app?.textContent?.slice(0,120)||null,
      appChildren:app?.children?.length||0,configStatus:response.status};
  });
  console.log("PRIVATE_BROWSER_BOOTSTRAP_DIAGNOSTIC",JSON.stringify({
    navigationStatus:first?.status(),...bootstrapDiagnostic,errors}));
  await page.locator("#account-login").waitFor();
  assert.equal(await page.locator("#toggle-auth").count(),0,"Public signup must be disabled");
  assert.equal(await page.locator("#toggle-invite").count(),1,"Private invitation signup must be visible");
  await page.locator('#account-login input[name="email"]').fill(ownerEmail);
  await page.locator('#account-login input[name="password"]').fill(ownerPassword);
  await page.locator("#account-login button.primary").click();
  await page.locator('[data-page="projects"]').waitFor();
  const cookies=await owner.cookies();
  const session=cookies.find(c=>c.name==="awos_session");
  assert.ok(session?.secure && session?.httpOnly,"Owner session must use Secure/HttpOnly cookie");
  assert.ok(!page.url().includes("token="),"Browser must not reveal tokens in URLs");
  const storedLegacyToken=await page.evaluate(()=>localStorage.getItem("agentWorkOsToken"));
  assert.equal(storedLegacyToken,null,"Production must not cache a development bearer token");

  await page.locator('[data-page="projects"]').click();
  await page.locator("#create-project").waitFor();
  const projectName="Browser verified private workspace";
  await page.locator('#create-project input[name="name"]').fill(projectName);
  await page.locator('#create-project input[name="repository"]').fill("example/approved-fixture");
  await page.locator('#create-project textarea[name="description"]').fill("Created through actual TLS customer UI");
  await page.locator('#create-project button[type="submit"]').click();
  await page.getByRole("heading",{name:projectName}).waitFor();
  assert.equal(await page.getByRole("heading",{name:projectName}).count(),1);

  await page.locator('[data-page="team"]').click();
  await page.locator("#team-invite").waitFor();
  const invitedEmail="browser-viewer-"+Date.now()+"@invalid.test";
  await page.locator('#team-invite input[name="email"]').fill(invitedEmail);
  await page.locator('#team-invite select[name="role"]').selectOption("viewer");
  await page.locator('#team-invite button[type="submit"]').click();
  const tokenNode=page.locator("#invite-token");
  await tokenNode.waitFor();
  const token=(await tokenNode.textContent()).trim();
  assert.match(token,/^[a-f0-9]{64}$/,"One-time invitation token must be 32 secure random bytes");
  await page.locator("#invite-clear").click();
  assert.equal(await page.locator("#invite-token").count(),0,"UI must remove token when cleared");
  await page.locator("#logout").click();
  await page.locator("#account-login").waitFor();
  assert.equal((await owner.cookies()).some(c=>c.name==="awos_session"),false,
    "Explicit sign-out must revoke and remove browser session");

  const viewer=await browser.newContext({ignoreHTTPSErrors:true});
  const invited=await viewer.newPage();
  invited.on("pageerror",()=>errors.push("invited_page_js_error"));
  await invited.goto(url,{waitUntil:"domcontentloaded"});
  await invited.locator("#toggle-invite").click();
  await invited.locator("#account-login").waitFor();
  await invited.locator('#account-login input[name="email"]').fill(invitedEmail);
  await invited.locator('#account-login input[name="password"]').fill(ownerPassword+"-viewer");
  await invited.locator('#account-login input[name="invitationToken"]').fill(token);
  await invited.locator("#account-login button.primary").click();
  await invited.locator('[data-page="projects"]').waitFor();
  await invited.locator('[data-page="projects"]').click();
  await invited.getByRole("heading",{name:projectName}).waitFor();
  assert.equal(await invited.locator("#create-project").count(),0,
    "Viewer cannot see project-write UI");
  await invited.locator('[data-page="models"]').click();
  assert.equal(await invited.locator("#grant-model").count(),0,
    "Viewer cannot approve private model routing");
  const denied=await invited.evaluate(async()=>{
    const org=document.querySelector("#org-picker")?.value;
    const csrf=document.cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith("awos_csrf="))?.slice(10);
    const resp=await fetch("/api/projects",{
      method:"POST",credentials:"same-origin",
      headers:{"content-type":"application/json","x-csrf-token":csrf},
      body:JSON.stringify({organizationId:org,name:"Viewer forbidden write"})
    });
    return resp.status;
  });
  assert.equal(denied,403,"Server must independently block forged viewer writes");
  assert.deepEqual(errors,[],"Page has no unexpected JavaScript errors");
  console.log("PRIVATE_BROWSER_UAT_PASS: HTTPS TLS, secure cookie sign-in/logout, project UI, invitation-only join, viewer RBAC and model-admin denial");
} finally {
  await browser?.close();
}
