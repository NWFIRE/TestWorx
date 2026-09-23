import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMonthlyInspectionList } from "@testworx/lib/server/index";
import { AppPageShell, PageHeader, SectionCard } from "../../operations-ui";
import { monthlyColumns } from "./csv";
import { MonthlyExportButton } from "./export-button";

export default async function MonthlyInspectionsPage({ searchParams }: { searchParams?: Promise<{ month?: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");
  if (!["tenant_admin", "office_admin"].includes(session.user.role)) redirect("/app");
  const params = await searchParams;
  const invalid = params?.month !== undefined && !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(params.month);
  const data = await getMonthlyInspectionList({ userId: session.user.id, tenantId: session.user.tenantId, role: session.user.role }, invalid ? undefined : params?.month);
  return <AppPageShell density="wide">
    <PageHeader eyebrow="Inspections" title="Monthly inspection list" description="All inspections scheduled in the selected month, including completed and cancelled visits. One row per inspection." actions={<Link href="/app/admin/inspections" className="text-sm font-semibold text-slateblue">Back to inspections</Link>} />
    <SectionCard>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <form className="flex flex-wrap items-end gap-3" action="/app/admin/inspections/monthly">
          <label className="text-sm font-medium">Month<input type="month" name="month" required min="1900-01" max="2199-12" defaultValue={data.month} className="mt-2 block rounded-xl border border-slate-200 p-3" /></label>
          <button className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold" type="submit">View month</button>
        </form>
        <MonthlyExportButton {...data} />
      </div>
      {invalid ? <p role="alert" className="mt-3 text-sm text-red-700">Invalid month. Showing the current month instead.</p> : null}
      <p className="mt-4 text-sm text-slate-500">{data.rows.length} inspections · {data.timezone}. CSV includes all rows shown below.</p>
      <div className="mt-4 max-w-full overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{monthlyColumns.map(column => <th key={column} className="whitespace-nowrap px-4 py-3 font-semibold">{column}</th>)}<th className="px-4 py-3">Action</th></tr></thead>
          <tbody>{data.rows.map(row => <tr key={row.id} className="border-t border-slate-200 hover:bg-slate-50">{row.values.map((value, index) => <td key={index} className="min-w-36 px-4 py-4 align-top">{value}</td>)}<td className="px-4 py-4"><Link href={`/app/admin/inspections/${row.id}`} className="font-semibold text-slateblue">Open</Link></td></tr>)}</tbody>
        </table>
        {!data.rows.length ? <p className="p-6 text-sm text-slate-500">No inspections scheduled for this month. You can still download the CSV headers.</p> : null}
      </div>
    </SectionCard>
  </AppPageShell>;
}
