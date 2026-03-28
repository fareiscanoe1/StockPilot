"use client";

import { useEffect, useState } from "react";

export function NotificationStream() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const es = new EventSource("/api/stream/alerts");
    es.addEventListener("hello", (e) => {
      setLines((l) => [...l, `hello: ${e.data}`]);
    });
    es.addEventListener("alerts", (e) => {
      setLines((l) => [...l, `alerts: ${e.data}`]);
    });
    es.addEventListener("error", () => {
      setLines((l) => [...l, "stream error / reconnecting…"]);
    });
    return () => es.close();
  }, []);

  return (
    <div className="card p-4">
      <h2 className="text-sm font-medium text-[var(--muted)]">Live alert stream</h2>
      <pre className="mt-2 max-h-40 overflow-auto text-[10px] text-[var(--muted)]">
        {lines.slice(-12).join("\n")}
      </pre>
    </div>
  );
}
