import { auth } from "@/auth";
import { redirect } from "next/navigation";

/** Legacy route — unified experience lives at `/commander`. */
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  redirect("/commander");
}
