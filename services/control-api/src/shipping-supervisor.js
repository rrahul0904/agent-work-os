import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertKnownBlocker, assertShippingContract, digestShippingContract } from "./shipping-contract.js";
import { appendShippingEvent, createShippingRun } from "./shipping-receipts.js";
import { GitWorktreeManager, ShellRunner } from "./shipping-adapters.js";
import { ShippingStore } from "./shipping-store.js";
import { verifyProductionApproval } from "./production-approval.js";

export class ShippingSupervisor {
  constructor({ runner, worktrees, store, now = () => new Date().toISOString(),
    allowProductionDeployment = process.env.AGENT_WORK_OS_ALLOW_PRODUCTION_DEPLOYMENT === "true",
    productionHostingTarget = process.env.AGENT_WORK_OS_PRODUCTION_HOSTING_TARGET || "",
    approvalSigningKey = process.env.AGENT_WORK_OS_PRODUCTION_APPROVAL_KEY || "" } = {}) {
    this.runner = runner ?? new ShellRunner();
    this.worktrees = worktrees ?? new GitWorktreeManager({ runner: this.runner });
    this.store = store ?? null;
    this.now = now;
    this.allowProductionDeployment = allowProductionDeployment === true;
    this.productionHostingTarget = productionHostingTarget;
    this.approvalSigningKey = approvalSigningKey;
  }

  async run(contractInput, { runId = `ship-${crypto.randomUUID()}`,
    approvalPermit = null, organizationId = null, machineId = null } = {}) {
    const contract = assertShippingContract(contractInput);
    const contractDigest = digestShippingContract(contract);
    let run = createShippingRun({
      runId,
      projectId: contract.project.id,
      releaseVersion: contract.release.version,
      contractDigest,
      at: this.now()
    });
    run = await this.event(run, { type: "contract.accepted", state: "CONTRACT_ACCEPTED", evidence: { contractDigest } });
    // Production deployment is a protected action. Merely submitting a valid
    // shipping contract cannot authorize a production shell command.
    if (contract.production.required && (!this.allowProductionDeployment ||
        !["aws", "oci", "onprem"].includes(this.productionHostingTarget))) {
      return await this.block(run, "BLOCKED_IRREVERSIBLE_ACTION",
        "production_deployment_requires_explicit_operator_opt_in_and_approved_host");
    }
    if (contract.production.required && (!contract.preview.required || !contract.exactSha.required)) {
      return await this.block(run, "BLOCKED_PRODUCT_DECISION",
        "production_requires_preview_uat_and_exact_test_deploy_sha");
    }

    let productionApproval = null;
    if (contract.production.required) {
      if (!/^[a-f0-9]{40}$/.test(contract.worktree.baseRef)) {
        return await this.block(run, "BLOCKED_IRREVERSIBLE_ACTION",
          "production_requires_approved_full_source_sha");
      }
      try {
        productionApproval = verifyProductionApproval(approvalPermit, {
          signingKey: this.approvalSigningKey, runId, contractDigest,
          machineId, organizationId, sourceSha: contract.worktree.baseRef,
          hostingTarget: this.productionHostingTarget
        });
      } catch (error) {
        return await this.block(run, "BLOCKED_IRREVERSIBLE_ACTION",
          "production_requires_signed_second_person_approval");
      }
    }

    let worktree;
    try {
      worktree = await this.worktrees.create({
        repoPath: contract.project.repoPath,
        baseRef: contract.worktree.baseRef,
        runId,
        root: contract.worktree.root
      });
    } catch (error) {
      return await this.block(run, "BLOCKED_SOURCE_UNKNOWN", `worktree:${error.message}`);
    }

    if (productionApproval && worktree.baseSha !== productionApproval.sourceSha) {
      return await this.block(run, "BLOCKED_SOURCE_UNKNOWN", "approved_source_sha_no_longer_matches_worktree");
    }
    run.worktreePath = worktree.worktreePath;
    run = await this.event(run, { type: "worktree.ready", state: "WORKTREE_READY", evidence: { baseSha: worktree.baseSha, worktreePath: worktree.worktreePath } });

    const artifactRoot = this.store?.root ?? path.join(os.tmpdir(), "agent-work-os-shipping-artifacts");
    const runDir = path.join(artifactRoot, "artifacts", runId);
    await fs.mkdir(runDir, { recursive: true });
    const contextFile = path.join(runDir, "context.json");
    const failureFile = path.join(runDir, "last-failure.json");
    await fs.writeFile(contextFile, `${JSON.stringify({ runId, contractDigest, project: contract.project, release: contract.release, goldenPath: contract.goldenPath }, null, 2)}\n`);
    const baseEnv = { SHIPPING_RUN_ID: runId, SHIPPING_CONTEXT_FILE: contextFile, SHIPPING_FAILURE_FILE: failureFile };

    const buildResult = await this.runCommand(contract.builder.command, worktree.worktreePath, { ...baseEnv, SHIPPING_STAGE: "build", SHIPPING_ATTEMPT: "0" });
    run = await this.event(run, { type: "builder.finished", state: buildResult.ok ? "BUILD_COMPLETE" : "REPAIRING", evidence: commandEvidence(buildResult) });

    const verification = await this.verifyWithRepair({ run, contract, cwd: worktree.worktreePath, baseEnv, failureFile, initialFailure: buildResult.ok ? null : buildResult });
    run = verification.run;
    if (!verification.ok) return run;

    let releaseFailure = null;
    for (let releaseAttempt = 0; releaseAttempt <= contract.builder.maxRepairAttempts; releaseAttempt += 1) {
      run.testedSha = await this.resolveSha(contract.exactSha.testedShaCommand, worktree.worktreePath, baseEnv, "tested");
      run = await this.event(run, { type: "sha.tested", state: "VERIFIED", evidence: { testedSha: run.testedSha, releaseAttempt } });

      releaseFailure = null;
      if (contract.preview.required) {
        const previewDeploy = await this.runCommand(contract.preview.deployCommand, worktree.worktreePath, { ...baseEnv, SHIPPING_STAGE: "preview-deploy" });
        run = await this.event(run, { type: "preview.deploy", state: previewDeploy.ok ? "PREVIEW_DEPLOYED" : "REPAIRING", evidence: commandEvidence(previewDeploy) });
        if (!previewDeploy.ok) releaseFailure = previewDeploy;
        if (!releaseFailure) {
          const previewUat = await this.runCommandList(contract.preview.uat, worktree.worktreePath, { ...baseEnv, SHIPPING_STAGE: "preview-uat" });
          run = await this.event(run, { type: "preview.uat", state: previewUat.ok ? "PREVIEW_UAT_PASS" : "REPAIRING", evidence: listEvidence(previewUat) });
          if (!previewUat.ok) releaseFailure = previewUat.firstFailure;
        }
      }

      if (!releaseFailure && contract.production.required) {
        // The reviewer's permit binds the *exact tested commit*. A build that
        // creates a new commit requires a new approval; it may never silently
        // deploy a different revision than the one the reviewer approved.
        if (run.testedSha !== productionApproval.sourceSha) {
          return await this.block(run, "BLOCKED_IRREVERSIBLE_ACTION", "tested_sha_differs_from_approved_source");
        }
        try {
          verifyProductionApproval(approvalPermit, {
            signingKey: this.approvalSigningKey, runId, contractDigest, organizationId, machineId,
            sourceSha: productionApproval.sourceSha, hostingTarget: this.productionHostingTarget
          });
        } catch { return await this.block(run, "BLOCKED_IRREVERSIBLE_ACTION", "production_approval_expired_before_deployment"); }
        const productionDeploy = await this.runCommand(contract.production.deployCommand, worktree.worktreePath, { ...baseEnv, SHIPPING_STAGE: "production-deploy" });
        run = await this.event(run, { type: "production.deploy", state: productionDeploy.ok ? "PRODUCTION_DEPLOYED" : "REPAIRING", evidence: commandEvidence(productionDeploy) });
        if (!productionDeploy.ok) releaseFailure = productionDeploy;
        if (!releaseFailure) {
          const productionUat = await this.runCommandList(contract.production.uat, worktree.worktreePath, { ...baseEnv, SHIPPING_STAGE: "production-uat" });
          run = await this.event(run, { type: "production.uat", state: productionUat.ok ? "PRODUCTION_UAT_PASS" : "REPAIRING", evidence: listEvidence(productionUat) });
          if (!productionUat.ok) releaseFailure = productionUat.firstFailure;
        }
      }

      if (!releaseFailure) {
        run.deployedSha = contract.exactSha.required
          ? await this.resolveSha(contract.exactSha.deployedShaCommand, worktree.worktreePath, baseEnv, "deployed")
          : run.testedSha;
        if (contract.exactSha.required && run.testedSha !== run.deployedSha) {
          releaseFailure = {
            name: "sha-match",
            command: contract.exactSha.deployedShaCommand.command,
            ok: false,
            code: 1,
            signal: null,
            timedOut: false,
            stdout: run.deployedSha,
            stderr: `deployed_sha_mismatch tested=${run.testedSha} deployed=${run.deployedSha}`,
            durationMs: 0
          };
          run = await this.event(run, { type: "sha.mismatch", state: "REPAIRING", evidence: { testedSha: run.testedSha, deployedSha: run.deployedSha } });
        }
      }

      if (!releaseFailure) break;
      if (releaseAttempt === contract.builder.maxRepairAttempts) return await this.fail(run, "release_repair_budget_exhausted");

      await fs.writeFile(failureFile, `${JSON.stringify(commandEvidence(releaseFailure), null, 2)}\n`, { mode: 0o600 });
      const repair = await this.runCommand(contract.builder.repairCommand, worktree.worktreePath, { ...baseEnv, SHIPPING_STAGE: "release-repair", SHIPPING_ATTEMPT: String(releaseAttempt + 1) });
      run = await this.event(run, { type: "release.repair", state: repair.ok ? "VERIFYING" : "REPAIRING", evidence: { attempt: releaseAttempt + 1, ...commandEvidence(repair) } });
      if (!repair.ok) { releaseFailure = repair; continue; }

      const reverify = await this.verifyWithRepair({ run, contract, cwd: worktree.worktreePath, baseEnv, failureFile, initialFailure: null });
      run = reverify.run;
      if (!reverify.ok) return run;
    }

    if (releaseFailure) return await this.fail(run, "release_failed");
    if (!contract.production.required) {
      // Even a complete build and test suite is not a deployment. The old
      // path incorrectly emitted SHIPPED and a release receipt here.
      run.deployedSha = null;
      run = await this.event(run, { type: "release.verified_without_deployment",
        state: "VERIFIED_ONLY", evidence: { testedSha: run.testedSha, productionDeployed: false } });
      if (contract.worktree.cleanupOnSuccess) await this.worktrees.remove({ repoPath: worktree.repoPath, worktreePath: worktree.worktreePath });
      return run;
    }
    // A test/UAT command returning exit code zero cannot independently certify
    // the live production release. Never emit SHIPPED or self-sign its receipt.
    run = await this.event(run, {
      type: "release.awaiting_external_certification",
      state: "AWAITING_EXTERNAL_CERTIFICATION",
      evidence: { testedSha: run.testedSha, deployedSha: run.deployedSha,
        productionCommandsSucceeded: true, independentReviewerRequired: true }
    });
    if (contract.worktree.cleanupOnSuccess) await this.worktrees.remove({ repoPath: worktree.repoPath, worktreePath: worktree.worktreePath });
    return run;
  }

  async verifyWithRepair({ run, contract, cwd, baseEnv, failureFile, initialFailure }) {
    let failure = initialFailure;
    for (let attempt = 0; attempt <= contract.builder.maxRepairAttempts; attempt += 1) {
      if (!failure) {
        const verification = await this.runCommandList(contract.verification, cwd, { ...baseEnv, SHIPPING_STAGE: "verification", SHIPPING_ATTEMPT: String(attempt) });
        run = await this.event(run, { type: "verification.finished", state: verification.ok ? "VERIFIED" : "REPAIRING", evidence: listEvidence(verification) });
        if (verification.ok) return { ok: true, run };
        failure = verification.firstFailure;
      }
      if (attempt === contract.builder.maxRepairAttempts) {
        await fs.writeFile(failureFile, `${JSON.stringify(commandEvidence(failure), null, 2)}\n`, { mode: 0o600 });
        return { ok: false, run: await this.fail(run, "repair_budget_exhausted") };
      }
      await fs.writeFile(failureFile, `${JSON.stringify(commandEvidence(failure), null, 2)}\n`, { mode: 0o600 });
      const repair = await this.runCommand(contract.builder.repairCommand, cwd, { ...baseEnv, SHIPPING_STAGE: "repair", SHIPPING_ATTEMPT: String(attempt + 1) });
      run = await this.event(run, { type: "repair.finished", state: repair.ok ? "VERIFYING" : "REPAIRING", evidence: { attempt: attempt + 1, ...commandEvidence(repair) } });
      failure = repair.ok ? null : repair;
    }
    return { ok: false, run: await this.fail(run, "repair_loop_invalid") };
  }

  async runCommandList(commands, cwd, env) {
    const results = [];
    for (const command of commands) {
      const result = await this.runCommand(command, cwd, env);
      results.push(result);
      if (!result.ok) return { ok: false, results, firstFailure: result };
    }
    return { ok: true, results, firstFailure: null };
  }

  async runCommand(command, cwd, env) {
    return await this.runner.run(command, { cwd, env, stage: env.SHIPPING_STAGE });
  }

  async resolveSha(command, cwd, env, label) {
    const result = await this.runner.run(command, { cwd, env: { ...env, SHIPPING_STAGE: `sha-${label}` }, stage: `sha-${label}` });
    if (!result.ok) throw new Error(`shipping_${label}_sha_probe_failed`);
    const value = result.stdout.trim();
    if (!/^[a-f0-9]{7,64}$/i.test(value)) throw new Error(`shipping_${label}_sha_invalid`);
    return value;
  }

  async block(run, code, message) {
    assertKnownBlocker(code);
    run.blocker = { code, message, at: this.now() };
    return await this.event(run, { type: "run.blocked", state: "BLOCKED", message, evidence: { code } });
  }
  async fail(run, message) { return await this.event(run, { type: "run.failed", state: "FAILED", message }); }
  async event(run, event) {
    const next = appendShippingEvent(run, { ...event, at: this.now() });
    await this.persist(next);
    return next;
  }
  async persist(run) { if (this.store) await this.store.save(run); }
}

export function createDefaultShippingSupervisor({ stateRoot, timeoutMs } = {}) {
  const runner = new ShellRunner({ timeoutMs });
  return new ShippingSupervisor({
    runner,
    worktrees: new GitWorktreeManager({ runner }),
    store: stateRoot ? new ShippingStore(stateRoot) : null
  });
}

function commandEvidence(result) {
  return {
    name: result?.name ?? null,
    ok: Boolean(result?.ok),
    code: result?.code ?? null,
    signal: result?.signal ?? null,
    timedOut: Boolean(result?.timedOut),
    durationMs: result?.durationMs ?? null,
    stdoutTail: tail(result?.stdout),
    stderrTail: tail(result?.stderr)
  };
}
function listEvidence(result) { return { ok: result.ok, commands: result.results.map(commandEvidence) }; }
function tail(value) { return String(value ?? "").slice(-4000); }
