/**
 * Run a single commander worker tick (for local testing or cron).
 * Usage:
 *   npm run worker:commander:tick
 *   npm run worker:commander:tick -- --userId=<id> --force=true
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
  const worker = new CommanderBackgroundWorker();
  const userId = arg("--userId") ?? undefined;
  const force = arg("--force") === "true";
  const result = await worker.runDueUsersTick({ userId, force });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
