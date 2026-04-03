import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl items-center px-6 py-10 lg:px-10">
        <div className="grid w-full grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] xl:gap-16">
          <section className="login-fade-up flex items-center">
            <div className="relative max-w-2xl overflow-hidden rounded-[28px] bg-[#1f4678] px-10 py-12 text-white shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(0,0,0,0.18),transparent_40%)]" />

              <div className="relative">
                <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-1 text-[11px] font-semibold tracking-[0.24em] text-white/80">
                  TRADEWORX
                </div>

                <h1 className="mt-8 max-w-[11ch] text-5xl font-semibold leading-[0.95] tracking-[-0.05em] sm:text-6xl lg:text-[64px]">
                  Fire inspection operations, streamlined.
                </h1>

                <p className="mt-6 max-w-xl text-lg leading-8 text-white/80">
                  Scheduling, field work, reporting, and customer records in one
                  reliable workspace.
                </p>
              </div>
            </div>
          </section>

          <section className="login-fade-up login-fade-up-delay-1 flex items-center justify-center lg:justify-end">
            <div className="w-full max-w-[440px] rounded-[28px] border border-slate-200/80 bg-white p-8 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
              <div>
                <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-[36px]">
                  Welcome back
                </h2>
                <p className="mt-2 text-base text-slate-500">
                  Continue your inspections and reporting.
                </p>
              </div>
              <LoginForm />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
