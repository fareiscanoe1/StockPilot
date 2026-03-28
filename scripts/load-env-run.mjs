/**
 * Loads .env then .env.local (later overrides) and runs a command.
 * Fixes Prisma CLI only reading .env while Next.js prefers .env.local.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import dotenv from "dotenv";

if (existsSync(".env")) dotenv.config({ path: ".env" });
if (existsSync(".env.local")) dotenv.config({ path: ".env.local", override: true });

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("Usage: node scripts/load-env-run.mjs <command> [...args]");
  process.exit(1);
}

const [cmd, ...args] = argv;
const isWin = process.platform === "win32";
const command = cmd === "npx" && isWin ? "npx.cmd" : cmd;

const result = spawnSync(command, args, {
  stdio: "inherit",
  env: process.env,
  shell: false,
});

process.exit(result.status ?? 1);
