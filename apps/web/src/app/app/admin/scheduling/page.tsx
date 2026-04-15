import { redirect } from "next/navigation";

export default async function LegacySchedulingPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const nextSearch = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.trim()) {
      nextSearch.set(key, value);
    } else if (Array.isArray(value)) {
      const first = value.find((entry) => entry.trim());
      if (first) {
        nextSearch.set(key, first);
      }
    }
  }

  const nextHref = nextSearch.toString()
    ? `/app/admin/inspections?${nextSearch.toString()}`
    : "/app/admin/inspections";

  redirect(nextHref);
}
