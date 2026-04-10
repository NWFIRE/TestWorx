import Link from "next/link";
import { addDays } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getQuickBooksDirectInvoiceFormOptions } from "@testworx/lib";

import { AppPageShell, PageHeader } from "../../operations-ui";
import { createDirectQuickBooksInvoiceAction } from "../../actions";
import { DirectInvoiceForm } from "./direct-invoice-form";

export default async function CreateBillingInvoicePage() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app/admin/billing");
  }

  const options = await getQuickBooksDirectInvoiceFormOptions({
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  });

  return (
    <AppPageShell density="wide">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              href="/app/admin/parts-and-services"
            >
              View parts and services
            </Link>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              href="/app/admin/billing"
            >
              Back to billing
            </Link>
          </div>
        }
        description="Create a QuickBooks invoice directly for walk-in work, counter sales, or billable items that do not belong to an inspection summary."
        eyebrow="Billing"
        title="Create invoice"
        contentWidth="full"
      />

      {!options.connection.connection.connected ? (
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800 shadow-panel">
          {options.connection.connection.guidance ?? "Reconnect QuickBooks before creating direct invoices."}
        </div>
      ) : null}

      <DirectInvoiceForm
        action={createDirectQuickBooksInvoiceAction}
        catalogItems={options.catalogItems}
        customers={options.customers}
        initialValue={{
          customerCompanyId: "",
          walkInCustomerName: "",
          walkInCustomerEmail: "",
          walkInCustomerPhone: "",
          siteLabel: "",
          issueDate: new Date().toISOString().slice(0, 10),
          dueDate: addDays(new Date(), 30).toISOString().slice(0, 10),
          memo: "",
          sendEmail: false,
          lineItems: [
            {
              id: "line_1",
              catalogItemId: "",
              description: "",
              quantity: 1,
              unitPrice: 0,
              taxable: false
            }
          ]
        }}
      />
    </AppPageShell>
  );
}
