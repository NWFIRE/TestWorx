import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getOwnUserProfile } from "@testworx/lib/server/index";
import { updateProfileAction } from "./actions";
import { ProfileForm } from "./profile-form";

const roleLabels: Record<string, string> = {
  platform_admin: "Platform administrator", tenant_admin: "Company administrator",
  office_admin: "Office administrator", technician: "Technician", customer_user: "Customer"
};

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const profile = await getOwnUserProfile({ userId: session.user.id, tenantId: session.user.tenantId ?? null });
  if (!profile) redirect("/login?session=stale");
  const initials = profile.name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join("").toUpperCase();
  const role = roleLabels[profile.role] ?? "Team member";
  const joined = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(profile.createdAt);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <header><p className="text-xs font-semibold tracking-wide text-blue-700">Your account</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">My profile</h1><p className="mt-2 text-sm text-slate-500">Manage your personal details and review your workspace access.</p></header>
      <section aria-label="Profile summary" className="flex min-w-0 flex-wrap items-center gap-5 rounded-2xl border border-slate-200 bg-gradient-to-r from-blue-50 via-white to-white p-5 sm:p-7">
        <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-white text-xl font-semibold text-blue-700">{initials || "TW"}</div>
        <div className="min-w-0 flex-1"><h2 className="break-words text-xl font-semibold text-slate-900">{profile.name}</h2><p className="mt-1 break-all text-sm text-slate-500">{profile.email}</p></div>
        <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800">{role}</span>
      </section>
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Personal details</h2><p className="mb-6 mt-1 text-sm text-slate-500">Keep your name recognizable to your team.</p>
          <ProfileForm name={profile.name} action={updateProfileAction} />
        </section>
        <div className="min-w-0 space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Workspace</h2>
            <dl className="mt-4 space-y-4 text-sm">
              {[["Company",profile.tenant?.name ?? "TradeWorx platform"],["Role",role],["Timezone",profile.tenant?.timezone ?? "Not configured"],["Member since",joined],...(profile.customerCompany ? [["Customer account",profile.customerCompany.name]] : [])].map(([label,value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-medium text-slate-800">{value}</dd></div>)}
            </dl>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Sign-in and security</h2>
            <p className="mt-3 text-xs text-slate-500">Sign-in email</p><p className="mt-1 break-all text-sm font-medium text-slate-800">{profile.email}</p>
            <p className="mt-3 text-sm leading-6 text-slate-500">Contact your workspace administrator to change your sign-in email, reset your password, or update your access.</p>
            {profile.role === "platform_admin" ? <a href="mailto:Support@tradeworx.net" className="mt-3 inline-block text-sm font-medium text-blue-700 underline">Contact support</a> : null}
          </section>
          {profile.role === "technician" ? <Link href="/app/tech/profile" className="block rounded-2xl border border-slate-200 bg-white p-5 text-sm font-medium text-blue-700">Offline readiness and sync tools &rarr;</Link> : null}
        </div>
      </div>
    </div>
  );
}
