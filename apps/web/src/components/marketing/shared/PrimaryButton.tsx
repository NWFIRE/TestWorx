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
    "inline-flex min-h-11 items-center justify-center rounded-[14px] bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(29,78,216,0.22)] transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2",
    className
  );

  if (href) {
    return <Link className={classes} href={href}>{children}</Link>;
  }

  return <button className={classes} type={type} {...props}>{children}</button>;
}
