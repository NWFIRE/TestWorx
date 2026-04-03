import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_30%),radial-gradient(circle_at_top,_rgba(30,58,95,0.14),_transparent_38%),linear-gradient(135deg,_#F8FAFC,_#E2E8F0)] px-6 py-10">
      <div className="mx-auto grid min-h-[85vh] max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col justify-between rounded-[2rem] bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.08),_transparent_32%),linear-gradient(160deg,_#23456f_0%,_#1E3A5F_52%,_#162B45_100%)] p-8 text-white shadow-[0_28px_80px_rgba(15,23,42,0.16)]">
          <div className="space-y-5">
            <span className="inline-flex rounded-full border border-white/25 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70">TradeWorx</span>
            <h1 className="login-fade-up max-w-xl text-4xl font-semibold leading-tight md:text-5xl">Fire inspection operations, streamlined.</h1>
            <p className="login-fade-up login-fade-up-delay-1 max-w-2xl text-base text-white/78 md:text-lg">Scheduling, field work, reporting, and customer records in one workspace.</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.08] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-white/60">Trusted access</p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75">Use the credentials assigned to your company account. If access needs to be restored, your office admin can update it from Team and Portal Access.</p>
          </div>
        </section>
        <section className="flex items-center justify-center">
          <div className="login-fade-up login-fade-up-delay-2 w-full max-w-md">
            <div className="mb-5">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">TradeWorx login</p>
              <h2 className="mt-2 text-3xl font-semibold text-ink">Welcome back</h2>
              <p className="mt-2 text-sm text-slate-500">Pick up scheduling, field work, and reporting where you left off.</p>
            </div>
            <LoginForm />
          </div>
        </section>
      </div>
    </main>
  );
}

