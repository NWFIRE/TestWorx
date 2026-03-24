import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(30,58,95,0.15),_transparent_35%),linear-gradient(135deg,_#F8FAFC,_#E2E8F0)] px-6 py-10">
      <div className="mx-auto grid min-h-[85vh] max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col justify-between rounded-[2rem] bg-slateblue p-8 text-white shadow-panel">
          <div className="space-y-6">
            <span className="inline-flex rounded-full border border-white/25 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70">TradeWorx</span>
            <h1 className="max-w-xl text-4xl font-semibold leading-tight md:text-5xl">Fire inspection operations built for dispatch, field execution, and customer trust.</h1>
            <p className="max-w-2xl text-base text-white/75 md:text-lg">Manage scheduling, field execution, reporting, customer documents, and operational follow-up from a secure workspace built for live service teams.</p>
          </div>
          <div className="rounded-3xl bg-white/10 p-6 backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-white/60">Access</p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75">Sign in with the credentials assigned to your company account. Contact your office administrator or TradeWorx support if you need access restored or your role updated.</p>
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

