"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NotificationAlertPrefsForm({
  initialMinConfidence,
  initialHighConviction,
  initialJournalOpenAiNoTrade,
}: {
  initialMinConfidence: string;
  initialHighConviction: boolean;
  initialJournalOpenAiNoTrade: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  return (
    <form
      className="card mt-4 max-w-lg space-y-3 p-4 text-sm"
      action={async (fd) => {
        const raw = fd.get("minTradeAlertConfidence");
        const minC =
          raw == null || String(raw).trim() === ""
            ? null
            : Number.parseFloat(String(raw));
        const body = {
          minTradeAlertConfidence:
            minC != null && Number.isFinite(minC) ? minC : null,
          alertsHighConvictionOnly: fd.get("alertsHighConvictionOnly") === "on",
          journalLogOpenAiNoTrade: fd.get("journalLogOpenAiNoTrade") === "on",
        };
        const r = await fetch("/api/notifications/prefs", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        setStatus(r.ok ? "Saved." : "Save failed.");
        router.refresh();
      }}
    >
      <h2 className="font-medium text-foreground">Alert & journal quality</h2>
      <p className="text-xs text-[var(--muted)]">
        Trade alerts only fire on TRADE ideas after the scan. Use these to cut noise. OpenAI{" "}
        <code className="text-foreground">NO_TRADE</code> rows are omitted from the journal unless
        you opt in (reduces DB spam).
      </p>
      <label className="block text-xs text-[var(--muted)]">
        Min confidence for trade alerts (0–10, leave empty for none)
        <input
          name="minTradeAlertConfidence"
          type="number"
          step="0.1"
          min={0}
          max={10}
          defaultValue={initialMinConfidence}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-black/30 px-3 py-2 text-sm text-foreground"
        />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          name="alertsHighConvictionOnly"
          defaultChecked={initialHighConviction}
        />
        High-conviction only (also require confidence ≥ 7)
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          name="journalLogOpenAiNoTrade"
          defaultChecked={initialJournalOpenAiNoTrade}
        />
        Log OpenAI NO_TRADE decisions to recommendation journal
      </label>
      <button
        type="submit"
        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white"
      >
        Save alert prefs
      </button>
      {status && <p className="text-xs text-[var(--muted)]">{status}</p>}
    </form>
  );
}
