import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@testworx/db";
import { subscriberFeaturesEnabled } from "@testworx/lib/src/subscriber-policy";
import { PageHeader } from "../../admin/operations-ui";
import { SendReportForm } from "./form";
export default async function DeliveryPage({ searchParams }: { searchParams: Promise<{ number?: string }> }) {
  if (!subscriberFeaturesEnabled()) notFound();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!session.user.tenantId || !["tenant_admin", "office_admin"].includes(session.user.role)) notFound();
  const value = (await searchParams).number ?? "";
  const number = Number(value.replace(/^RPT-/, ""));
  const report = Number.isSafeInteger(number) && number > 0 ? await prisma.inspectionReport.findFirst({ where: { tenantId: session.user.tenantId, reportNumber: number, status: "finalized" }, select: { id: true, reportNumber: true, inspection: { select: { customerCompany: { select: { name: true, contactEmails: true, billingEmail: true } } } } } }) : null;
  return <section className="mx-auto max-w-3xl space-y-5"><PageHeader eyebrow="Customer report delivery" title="Send an issued report" /><form className="flex flex-wrap gap-3"><input name="number" aria-label="Report number" placeholder="Report number" defaultValue={value} className="min-w-0 flex-1 rounded-xl border p-3" /><button className="rounded-xl bg-blue-700 px-5 py-3 text-white">Find report</button></form>
    {report ? <div className="space-y-4 rounded-2xl border bg-white p-6"><h2 className="font-semibold">{report.inspection.customerCompany.name}</h2><p>Recipient: {report.inspection.customerCompany.contactEmails || report.inspection.customerCompany.billingEmail || "Email needed"}</p><SendReportForm reportId={report.id} /><Link className="block text-blue-700" href={`/app/help/new?report=${report.id}&from=/app/help/delivery`}>Report a delivery problem</Link></div> : value ? <p>No finalized report matches this number in your company.</p> : null}
  </section>;
}
