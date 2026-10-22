#!/usr/bin/env node
import path from 'node:path';
import { startMcpStdio } from '../packages/path-context/src/mcp.js';
startMcpStdio({cwd:path.resolve(process.argv[2] ?? process.cwd())});
