"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CustomerOption, SiteOption, TechnicianOption } from "@testworx/types";

import { createInspectionAction } from "../actions";
import {
  type InspectionSchedulerFormInitialValues,
  InspectionSchedulerForm
} from "../inspection-scheduler-form";

export function InspectionCreatePanel({
  customers,
  sites,
  technicians,
  initialOpen = false,
  showTrigger = true,
  initialValues
}: {
  customers: CustomerOption[];
  sites: SiteOption[];
  technicians: TechnicianOption[];
  initialOpen?: boolean;
  showTrigger?: boolean;
  initialValues?: InspectionSchedulerFormInitialValues;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(initialOpen);

  useEffect(() => {
    setOpen(initialOpen);
  }, [initialOpen]);

  function updateCreateQueryParam(nextOpen: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextOpen) {
      params.set("create", "1");
    } else {
      params.delete("create");
    }

    const nextSearch = params.toString();
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, { scroll: false });
  }

  if (!open && !showTrigger) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Create Inspection
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Start a new inspection from the dedicated operations workspace.
          </p>
        </div>
        {showTrigger ? (
          <button
            className="inline-flex min-h-12 items-center rounded-2xl bg-slateblue px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgb(var(--tenant-primary-rgb)_/_0.2)] transition duration-150 hover:brightness-110 active:scale-[0.99]"
            onClick={() => {
              const nextOpen = !open;
              setOpen(nextOpen);
              updateCreateQueryParam(nextOpen);
            }}
            type="button"
          >
            {open ? "Close create inspection" : "+ Create Inspection"}
          </button>
        ) : (
          <button
            className="inline-flex min-h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            onClick={() => {
              setOpen(false);
              updateCreateQueryParam(false);
            }}
            type="button"
          >
            Close
          </button>
        )}
      </div>

      {open ? (
        <InspectionSchedulerForm
          action={createInspectionAction}
          allowCustomOneTimeSite
          allowDocumentUpload
          autoSelectGenericSiteOnCustomerChange
          customers={customers}
          onSuccess={() => {
            setOpen(false);
            updateCreateQueryParam(false);
            router.refresh();
          }}
          sites={sites}
          submitLabel="Create inspection"
          technicians={technicians}
          title="Create inspection"
          initialValues={initialValues}
        />
      ) : null}
    </div>
  );
}
