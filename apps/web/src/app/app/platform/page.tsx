import { redirect } from "next/navigation";

import { prisma } from "@testworx/db";

import { auth } from "@/auth";

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
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Platform overview</p>
        <h2 className="mt-2 text-3xl font-semibold text-ink">Multi-tenant operating picture</h2>
      </div>
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
