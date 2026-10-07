import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assertKnownBlocker, assertShippingContract, digestShippingContract } from "./shipping-contract.js";
import { appendShippingEvent, buildReleaseReceipt, createShippingRun } from "./shipping-receipts.js";
import { GitWorktreeManager, ShellRunner } from "./shipping-adapters.js";
import { ShippingStore } from "./shipping-store.js";

export class ShippingSupervisor {
  constructor({ runner, worktrees, store, now = () => new Date().toISOString() } = {}) {
    this.runner = runner ?? new ShellRunner();
    this.worktrees = worktrees ?? new GitWorktreeManager({ runner: this.runner });
    this.store = store ?? null;
    this.now = now;
  }

  async run(contractInput, { runId = `ship-${crypto.randomUUID()}` } = {}) {
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

    run.worktreePath = worktree.worktreePath;
    run = await this.event(run, { type: "worktree.ready", state: "WORKTREE_READY", evidence: { baseSha: worktree.baseSha, worktreePath: worktree.worktreePath } });

    const runDir = path.join(worktree.worktreePath, ".agent-work-os", "shipping", runId);
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
    run = await this.event(run, { type: "sha.verified", state: "PRODUCTION_VERIFIED", evidence: { testedSha: run.testedSha, deployedSha: run.deployedSha } });
    run = await this.event(run, { type: "release.shipped", state: "SHIPPED", evidence: { goldenPath: contract.goldenPath.map((item) => item.id) } });
    const receipt = buildReleaseReceipt(run, { goldenPath: contract.goldenPath });
    const receiptFile = path.join(runDir, "release-receipt.json");
    await fs.writeFile(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    run.releaseReceipt = receipt;
    run.receiptFile = receiptFile;
    await this.persist(run);

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
