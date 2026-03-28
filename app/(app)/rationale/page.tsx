import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";

export default async function RationalePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const logs = await prisma.recommendationLog.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">AI rationale</h1>
      <p className="text-sm text-[var(--muted)]">
        Each entry records <code>TRADE</code> or <code>NO_TRADE</code>, reason codes, exact
        sources used vs missing, and factual vs inferred payload.
      </p>
      <div className="space-y-3">
        {logs.map((log) => {
          const su = log.sourcesUsed as Record<string, string> | null;
          const sm = log.sourcesMissing as string[] | null;
          return (
            <details key={log.id} className="card p-4">
              <summary className="cursor-pointer text-sm font-medium">
                {log.createdAt.toISOString()} — {log.ticker} ·{" "}
                <span className="text-foreground">{log.decision}</span>
                {log.reasonCode ? ` · ${log.reasonCode}` : ""} · conf{" "}
                {Number(log.confidence).toFixed(1)}
              </summary>
              <div className="mt-3 space-y-2 text-xs text-[var(--muted)]">
                <div>
                  <span className="text-foreground">Sources used:</span>{" "}
                  {su ? JSON.stringify(su) : "—"}
                </div>
                <div>
                  <span className="text-foreground">Sources missing:</span>{" "}
                  {sm?.length ? sm.join(", ") : "—"}
                </div>
              </div>
              <pre className="mt-2 max-h-64 overflow-auto text-[10px] text-[var(--muted)]">
                {JSON.stringify(log.decisionPayload, null, 2)}
              </pre>
            </details>
          );
        })}
        {logs.length === 0 && (
          <p className="text-sm text-[var(--muted)]">No recommendation logs yet.</p>
        )}
      </div>
    </div>
  );
}
