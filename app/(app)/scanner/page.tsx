import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getScannerSnapshot } from "@/lib/queries/scanner-snapshot";
import { ScannerPageClient } from "@/components/ScannerPageClient";

export default async function ScannerPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const sp = (await searchParams) ?? {};
  const debugParam = sp.debug;
  const debugOn =
    debugParam === "1" ||
    (Array.isArray(debugParam) && debugParam.includes("1")) ||
    process.env.SCANNER_QUOTE_DEBUG === "1";
  const snap = await getScannerSnapshot(session.user.id, {
    includeQuoteDiagnostics: debugOn,
  });

  return <ScannerPageClient initialSnapshot={snap} debugOn={debugOn} />;
}
