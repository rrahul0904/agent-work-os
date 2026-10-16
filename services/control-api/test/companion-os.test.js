import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const htmlPath = path.join(root, 'apps/web/public/companion-os/index.html');
const jsPath = path.join(root, 'apps/web/public/companion-os/app.js');
const cssPath = path.join(root, 'apps/web/public/companion-os/styles.css');
const contractPath = path.join(root, 'contracts/companion-os.v1.json');
const portfolioPath = path.join(root, 'config/portfolio.json');
const dossierPath = path.join(root, 'docs/reverse-engineering/abhidu-companion-os.md');

test('Companion OS browser bundle is present and JavaScript parses', async () => {
  const [html, css] = await Promise.all([readFile(htmlPath, 'utf8'), readFile(cssPath, 'utf8')]);
  assert.match(html, /<title>Companion OS/);
  assert.match(html, /src="\.\/app\.js"/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(css, /\.app-shell/);
  const parsed = spawnSync(process.execPath, ['--check', jsPath], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr || parsed.stdout);
});

test('Companion OS capability contract is valid and denies prototype external writes', async () => {
  const contract = JSON.parse(await readFile(contractPath, 'utf8'));
  assert.equal(contract.version, 'companion-os/v1');
  assert.equal(contract.product.cleanRoom, true);
  assert.equal(contract.policy.default, 'deny-external-write');
  assert.equal(contract.policy.prototypeExternalWrites, false);
  assert.ok(contract.policy.approvalRequired.includes('send'));
  assert.ok(contract.verification.goldenPaths.includes('approval-intercept'));
});

test('Companion OS is tracked as building and has a clean-room REA dossier', async () => {
  const portfolio = JSON.parse(await readFile(portfolioPath, 'utf8'));
  const project = portfolio.projects.find((entry) => entry.id === 'companion-os');
  assert.ok(project, 'companion-os portfolio entry must exist');
  assert.equal(project.status, 'BUILDING');
  assert.ok(project.readiness < 100, 'prototype must not claim shipped readiness');
  const dossier = await readFile(dossierPath, 'utf8');
  assert.match(dossier, /clean-room reconstruction/i);
  assert.match(dossier, /No source code, proprietary assets/i);
  assert.match(dossier, /REA remains the discovery\/reconstruction\/evidence capability/i);
});
