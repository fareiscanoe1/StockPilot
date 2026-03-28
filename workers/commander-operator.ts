/**
 * Continuous commander worker (heartbeat + due scans).
 * Usage:
 *   npm run worker:commander                 # loop every 15s
 *   npm run worker:commander -- --poll-ms=5000
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import prisma from "../lib/db";
import { CommanderBackgroundWorker } from "../lib/commander/background-worker";

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  if (!hit) return null;
  return hit.slice(name.length + 1);
}

async function main() {
  const pollMs = Number(arg("--poll-ms") ?? "15000");
  const worker = new CommanderBackgroundWorker();
  await worker.runLoop({ pollMs: Number.isFinite(pollMs) ? pollMs : 15000 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
