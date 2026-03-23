import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getDefaultDashboardPath } from "@testworx/lib";

export default async function DashboardRouterPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  redirect(getDefaultDashboardPath(session.user.role));
}

