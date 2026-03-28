import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const orders = await prisma.simulatedOrder.findMany({
    where: { virtualAccount: { userId: session.user.id } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { fills: true, virtualAccount: true },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Trade history</h1>
      <div className="card overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs text-[var(--muted)]">
            <tr>
              <th className="p-2">Time</th>
              <th className="p-2">Book</th>
              <th className="p-2">Action</th>
              <th className="p-2">Symbol</th>
              <th className="p-2">Side</th>
              <th className="p-2">Qty</th>
              <th className="p-2">Tag</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-[var(--border)]">
                <td className="p-2 text-xs text-[var(--muted)]">
                  {o.createdAt.toISOString()}
                </td>
                <td className="p-2 text-xs">{o.virtualAccount.name}</td>
                <td className="p-2">{o.action}</td>
                <td className="p-2 font-mono">{o.symbol}</td>
                <td className="p-2">{o.side}</td>
                <td className="p-2">{Number(o.quantity).toFixed(4)}</td>
                <td className="p-2 text-xs text-[var(--muted)]">{o.strategyTag}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && (
          <p className="p-4 text-sm text-[var(--muted)]">No simulated orders yet.</p>
        )}
      </div>
    </div>
  );
}
