import Link from "next/link";

export function LogoLockup() {
  return (
    <Link className="inline-flex items-center gap-3" href="/">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold tracking-[0.18em] text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)]">
        TW
      </div>
      <div>
        <p className="text-base font-semibold tracking-[-0.03em] text-slate-950">TradeWorx</p>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Fire service ops</p>
      </div>
    </Link>
  );
}
