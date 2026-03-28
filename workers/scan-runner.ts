/**
 * Background worker entrypoint — run on a schedule (cron, systemd timer, or Redis queue).
 * Example cron (every 15 min): POST /api/cron/scan with Authorization: Bearer $CRON_SECRET
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { ScanRunner } from "../lib/engines/scan-runner";
import prisma from "../lib/db";

const userId = process.argv[2];

async function main() {
  if (!userId) {
    console.error("Usage: tsx workers/scan-runner.ts <userId>");
    process.exit(1);
  }
  const runner = new ScanRunner();
  await runner.runForUser(userId);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
