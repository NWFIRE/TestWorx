"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type Props = {
  children: ReactNode;
  href?: string;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function SecondaryButton({ children, href, className, type = "button", ...props }: Props) {
  const classes = cn(
    "inline-flex min-h-11 items-center justify-center rounded-[14px] border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 focus-visible:ring-offset-2",
    className
  );

  if (href) {
    return <Link className={classes} href={href}>{children}</Link>;
  }

  return <button className={classes} type={type} {...props}>{children}</button>;
}
