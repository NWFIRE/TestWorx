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

export function PrimaryButton({ children, href, className, type = "button", ...props }: Props) {
  const classes = cn(
    "inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(37,99,235,0.24)] transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
    className
  );

  if (href) {
    return <Link className={classes} href={href}>{children}</Link>;
  }

  return <button className={classes} type={type} {...props}>{children}</button>;
}
