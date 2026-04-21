import Link from "next/link";

export function NavLinkGroup({
  links
}: {
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <nav className="hidden items-center gap-7 lg:flex">
      {links.map((link) => (
        <Link key={link.href} className="text-sm font-semibold text-slate-700 transition hover:text-slate-950" href={link.href}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
