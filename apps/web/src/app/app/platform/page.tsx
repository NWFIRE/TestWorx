import { redirect } from "next/navigation";

import { prisma } from "@testworx/db";

import { auth } from "@/auth";
import { PageHeader } from "../admin/operations-ui";

export default async function PlatformPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== "platform_admin") {
    return null;
  }

  const [tenantCount, userCount, inspectionCount] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
    prisma.inspection.count()
  ]);

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Platform overview" title="Multi-tenant operating picture" />
      <div className="grid gap-4 md:grid-cols-3">
        {[["Tenants", tenantCount], ["Users", userCount], ["Inspections", inspectionCount]].map(([label, value]) => (
          <div key={String(label)} className="rounded-3xl bg-white p-6 shadow-panel">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
