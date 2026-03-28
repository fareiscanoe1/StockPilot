import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { NotificationStream } from "@/components/NotificationStream";

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <p className="text-sm text-[var(--muted)]">
        Near real-time in-app stream (SSE). Telegram/Discord need env + prefs below.
      </p>
      <NotificationStream />
      <div className="card p-4 text-sm">
        <h2 className="font-medium">Current preferences</h2>
        <pre className="mt-2 max-h-48 overflow-auto text-xs text-[var(--muted)]">
          {JSON.stringify(prefs, null, 2)}
        </pre>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Update via PUT <code>/api/notifications/prefs</code> or extend this form later.
        </p>
      </div>
    </div>
  );
}
