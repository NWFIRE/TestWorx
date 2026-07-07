"use client";

import { useRouter } from "next/navigation";

export const openInspectionCreateEventName = "tradeworx:open-inspection-create";

export function CreateInspectionTrigger({
  href
}: {
  href: string;
}) {
  const router = useRouter();

  function openCreatePanel() {
    window.dispatchEvent(new CustomEvent(openInspectionCreateEventName));
    router.replace(href, { scroll: false });
  }

  return (
    <button
      className="inline-flex min-h-12 items-center rounded-2xl bg-slateblue px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgb(var(--tenant-primary-rgb)_/_0.2)] transition duration-150 hover:brightness-110 active:scale-[0.99]"
      onClick={openCreatePanel}
      type="button"
    >
      + Create Inspection
    </button>
  );
}
