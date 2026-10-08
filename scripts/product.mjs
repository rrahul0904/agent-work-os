#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';

const host = process.env.AGENT_WORK_OS_HOST ?? '127.0.0.1';
const port = String(process.env.PORT ?? process.env.AGENT_WORK_OS_PORT ?? '8787');
const token = process.env.AGENT_WORK_OS_TOKEN || crypto.randomBytes(24).toString('base64url');
const daemonHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
const serverUrl = process.env.AGENT_WORK_OS_SERVER_URL || `ws://${daemonHost}:${port}/ws`;
const env = {
  ...process.env,
  AGENT_WORK_OS_HOST: host,
  AGENT_WORK_OS_PORT: port,
  AGENT_WORK_OS_TOKEN: token,
  AGENT_WORK_OS_SERVER_URL: serverUrl,
  AGENT_WORK_OS_MACHINE_NAME: process.env.AGENT_WORK_OS_MACHINE_NAME || 'local-product-executor'
};
const children = new Set();
let shuttingDown = false;

function start(args, label) {
  const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
  children.add(child);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;
    console.error(`[product] ${label} exited unexpectedly (${signal || code ?? 'unknown'})`);
    shutdown(code || 1);
  });
  return child;
}

console.log('');
console.log('Shipping OS product factory');
console.log('──────────────────────────');
console.log(`Console: http://${daemonHost}:${port}/?token=${encodeURIComponent(token)}`);
console.log(`Executor: ${serverUrl}`);
console.log('The console removes the token from the URL after first load.');
console.log('Press Ctrl+C to stop the local product.');
console.log('');

start(['services/control-api/src/index.js'], 'control plane');
start(['runtime/daemon/src/index.js'], 'local daemon');

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  const timer = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
    process.exit(code);
  }, 1500);
  timer.unref();
  Promise.all([...children].map(child => new Promise(resolve => child.once('exit', resolve)))).finally(() => process.exit(code));
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
