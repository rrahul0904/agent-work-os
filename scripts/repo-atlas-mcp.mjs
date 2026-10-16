#!/usr/bin/env node
import process from "node:process";

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createRepoAtlasMcpServer } from "../packages/repo-intelligence/src/mcp.js";

const rootPath = getFlag(process.argv.slice(2), "--root=") ?? process.env.REPO_ATLAS_ROOT;

if (!rootPath) {
  process.stderr.write("Repo Atlas MCP requires --root=<directory> or REPO_ATLAS_ROOT.\n");
  process.exitCode = 2;
} else {
  try {
    const handle = serveStdio(() => createRepoAtlasMcpServer({ rootPath }));
    process.stderr.write("Repo Atlas MCP serving bounded read-only tools over stdio.\n");
    process.on("SIGINT", () => {
      void handle.close();
    });
    process.on("SIGTERM", () => {
      void handle.close();
    });
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: error?.code ?? error?.name ?? "repo_atlas_mcp_start_failed",
      message: error?.message ?? String(error)
    })}\n`);
    process.exitCode = 1;
  }
}

function getFlag(args, prefix) {
  const match = args.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}
