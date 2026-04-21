import type { ReactNode } from "react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function SectionContainer({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("w-full px-5 md:px-8 xl:px-10 2xl:px-12", className)}>{children}</div>;
}
