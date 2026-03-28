import { AppSidebar } from "@/components/AppSidebar";
import { DeskHeaderBar } from "@/components/DeskHeaderBar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[var(--border)] bg-[#070b12]/90 px-4 py-3 backdrop-blur">
          <DeskHeaderBar />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
