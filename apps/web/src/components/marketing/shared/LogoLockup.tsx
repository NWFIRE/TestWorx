import Link from "next/link";

export function LogoLockup() {
  return (
    <Link className="inline-flex items-center gap-3" href="/">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold tracking-[0.18em] text-white shadow-[0_18px_38px_rgba(15,23,42,0.24)]">
        <div className="grid grid-cols-2 gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-white/95" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/95" />
        </div>
      </div>
      <div>
        <p className="text-[1.08rem] font-semibold tracking-[-0.045em] text-slate-950">TradeWorx</p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">Fire Service Platform</p>
      </div>
    </Link>
  );
}
