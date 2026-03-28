import { AppSidebar } from "@/components/AppSidebar";
import { RealDataOnlyBadge } from "@/components/RealDataOnlyBadge";
import { SimulatedBanner } from "@/components/SimulatedBanner";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[var(--border)] bg-[#070b12]/80 p-4 backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <SimulatedBanner />
            </div>
            <RealDataOnlyBadge />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
