import { LoginForm } from "./login-form";

const demoLogins = [
  ["Platform admin", "platform@nwfiredemo.com"],
  ["Tenant admin", "tenantadmin@evergreenfire.com"],
  ["Office admin", "office@evergreenfire.com"],
  ["Technician", "tech1@evergreenfire.com"],
  ["Customer", "facilities@pinecrestpm.com"]
];

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(30,58,95,0.15),_transparent_35%),linear-gradient(135deg,_#F8FAFC,_#E2E8F0)] px-6 py-10">
      <div className="mx-auto grid min-h-[85vh] max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col justify-between rounded-[2rem] bg-slateblue p-8 text-white shadow-panel">
          <div className="space-y-6">
            <span className="inline-flex rounded-full border border-white/25 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70">TradeWorx</span>
            <h1 className="max-w-xl text-4xl font-semibold leading-tight md:text-5xl">Fire inspection operations built for dispatch, field execution, and customer trust.</h1>
            <p className="max-w-2xl text-base text-white/75 md:text-lg">This MVP foundation includes tenant-aware scheduling, technician work queues, draft reports, and role-specific entry points designed to scale cleanly into a full production platform.</p>
          </div>
          <div className="grid gap-4 rounded-3xl bg-white/10 p-6 backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-white/60">Demo accounts</p>
            <div className="grid gap-3 md:grid-cols-2">
              {demoLogins.map(([label, email]) => (
                <div key={email} className="rounded-2xl border border-white/15 px-4 py-3">
                  <p className="text-sm text-white/60">{label}</p>
                  <p className="font-medium">{email}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-white/70">Shared demo password: Password123!</p>
          </div>
        </section>
        <section className="flex items-center justify-center">
          <div className="w-full max-w-md">
            <div className="mb-6">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Secure access</p>
              <h2 className="mt-2 text-3xl font-semibold text-ink">Sign in to your workspace</h2>
            </div>
            <LoginForm />
          </div>
        </section>
      </div>
    </main>
  );
}

