import Link from "next/link";
import Image from "next/image";

export function LogoLockup() {
  return (
    <Link aria-label="TradeWorx home" className="inline-flex items-center gap-3" href="/">
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <Image alt="" className="object-contain p-1" fill priority sizes="44px" src="/icon.png" />
      </div>
      <div>
        <p className="text-[13px] font-black uppercase tracking-[0.26em] text-slate-950">TradeWorx</p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">Fire Service Platform</p>
      </div>
    </Link>
  );
}
