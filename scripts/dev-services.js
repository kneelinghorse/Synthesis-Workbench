#!/usr/bin/env node

/**
 * dev-services.js — Starts all development services in parallel:
 *
 *   1. Next.js dev server          (localhost:3000)
 *   2. OODS Foundry MCP bridge     (localhost:4466)
 *   3. Stage1 MCP bridge           (localhost:3200)
 *
 * Usage:
 *   pnpm dev:services          # start all three
 *   node scripts/dev-services.js
 *
 * Each service logs with a colored prefix. Press Ctrl+C to stop all.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DESIGN_TOOLS = path.resolve(PROJECT_ROOT, "..");
const FOUNDRY_PORT = 4466;
const STAGE1_PORT = 3200;
const HEALTH_TIMEOUT_MS = 1200;
const STARTUP_HEALTH_RETRY_MS = 300;
const STARTUP_HEALTH_MAX_ATTEMPTS = 20;

const FOUNDRY_BRIDGE = path.join(
  DESIGN_TOOLS,
  "OODS-Forge/packages/mcp-bridge"
);
const STAGE1_BRIDGE = path.join(
  DESIGN_TOOLS,
  "Stage1/packages/mcp-bridge"
);

const RESET = "\x1b[0m";

const services = [
  {
    name: "next",
    color: "\x1b[36m", // cyan
    cmd: "pnpm",
    args: ["dev"],
    cwd: PROJECT_ROOT,
    env: {},
    healthUrl: "http://127.0.0.1:3000",
  },
  {
    name: "foundry",
    color: "\x1b[35m", // magenta
    cmd: "pnpm",
    args: ["dev"],
    cwd: FOUNDRY_BRIDGE,
    env: { MCP_BRIDGE_PORT: String(FOUNDRY_PORT) },
    healthUrl: `http://127.0.0.1:${FOUNDRY_PORT}/health`,
  },
  {
    name: "stage1",
    color: "\x1b[33m", // yellow
    cmd: "pnpm",
    args: ["dev"],
    cwd: STAGE1_BRIDGE,
    env: { PORT: String(STAGE1_PORT) },
    healthUrl: `http://127.0.0.1:${STAGE1_PORT}/health`,
  },
];

const maxNameLen = Math.max(...services.map((s) => s.name.length));

const children = [];
let shuttingDown = false;

const requiredDirs = [
  { label: "project", path: PROJECT_ROOT },
  { label: "foundry bridge", path: FOUNDRY_BRIDGE },
  { label: "stage1 bridge", path: STAGE1_BRIDGE },
];

for (const required of requiredDirs) {
  if (!existsSync(required.path)) {
    console.error(`Missing ${required.label} directory: ${required.path}`);
    process.exit(1);
  }
}

const shutdown = (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log("\nShutting down all services...");
  for (const { child } of children) {
    child.kill("SIGTERM");
  }
  setTimeout(() => {
    for (const { child } of children) {
      if (!child.killed) child.kill("SIGKILL");
    }
    process.exit(exitCode);
  }, 3000);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const isServiceHealthy = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const isFoundryRunHealthy = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`http://127.0.0.1:${FOUNDRY_PORT}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tool: "repl",
        input: {
          action: "render",
          mode: "full",
          apply: false,
          schema: {
            version: "2025.11",
            screens: [
              {
                id: "health-probe",
                component: "Button",
                props: { label: "Health Probe" },
              },
            ],
          },
        },
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return false;
    }

    const payload = await response.json().catch(() => null);
    return Boolean(payload && payload.ok);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const waitForHealth = async (check, maxAttempts = STARTUP_HEALTH_MAX_ATTEMPTS) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const healthy = await check();
    if (healthy) {
      return { healthy: true, attempts: attempt };
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, STARTUP_HEALTH_RETRY_MS));
    }
  }

  return { healthy: false, attempts: maxAttempts };
};

const launchService = (svc) => {
  const prefix = `${svc.color}[${svc.name.padEnd(maxNameLen)}]${RESET}`;
  const child = spawn(svc.cmd, svc.args, {
    cwd: svc.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...svc.env },
  });

  const prefixStream = (stream) => {
    stream.on("data", (chunk) => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          process.stdout.write(`${prefix} ${line}\n`);
        }
      }
    });
  };

  prefixStream(child.stdout);
  prefixStream(child.stderr);

  child.on("exit", (code, signal) => {
    console.log(
      `${prefix} exited (code=${code ?? "null"}, signal=${signal ?? "none"})`
    );

    if (!shuttingDown && code !== 0 && code !== null) {
      shutdown(code);
    }
  });

  child.on("error", (error) => {
    console.error(`${prefix} failed to start: ${error.message}`);
    if (!shuttingDown) {
      shutdown(1);
    }
  });

  children.push({ name: svc.name, child, prefix });
};

const main = async () => {
  console.log("Starting dev services:");
  for (const svc of services) {
    console.log(
      `  ${svc.color}${svc.name}${RESET} → ${svc.cmd} ${svc.args.join(" ")} (${svc.cwd})`
    );
  }
  console.log("");

  for (const svc of services) {
    const prefix = `${svc.color}[${svc.name.padEnd(maxNameLen)}]${RESET}`;
    if (svc.healthUrl && (await isServiceHealthy(svc.healthUrl))) {
      console.log(`${prefix} already healthy at ${svc.healthUrl}; reusing existing service`);
      if (svc.name === "foundry") {
        const result = await waitForHealth(isFoundryRunHealthy, 3);
        if (result.healthy) {
          console.log(
            `${prefix} startup health check passed (/run reachable at 127.0.0.1:${FOUNDRY_PORT})`
          );
        } else {
          console.error(
            `${prefix} startup health check failed (/run unreachable at 127.0.0.1:${FOUNDRY_PORT})`
          );
        }
      }
      continue;
    }
    launchService(svc);

    if (svc.name === "foundry") {
      const result = await waitForHealth(isFoundryRunHealthy);
      if (result.healthy) {
        console.log(
          `${prefix} startup health check passed (/run reachable at 127.0.0.1:${FOUNDRY_PORT} after ${result.attempts} attempt${result.attempts === 1 ? "" : "s"})`
        );
      } else {
        console.error(
          `${prefix} startup health check failed (/run unreachable at 127.0.0.1:${FOUNDRY_PORT})`
        );
      }
    }
  }
};

main().catch((error) => {
  console.error(`dev-services failed: ${error instanceof Error ? error.message : String(error)}`);
  shutdown(1);
});
