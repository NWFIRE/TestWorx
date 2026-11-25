import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { subscriberFeaturesEnabled, supportPagePath } from "@testworx/lib/src/subscriber-policy";
import { PageHeader } from "../../admin/operations-ui";
import { ProblemForm } from "../forms";

export default async function NewProblemPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!subscriberFeaturesEnabled()) notFound();
  if (!(await auth({ subscriptionRecovery: true }))?.user?.id) redirect("/login");
  const params = await searchParams;
  return <section className="mx-auto max-w-3xl space-y-5"><PageHeader eyebrow="Help" title="Report a problem" />
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><ProblemForm pagePath={supportPagePath(params.from)} errorReference={typeof params.error === "string" && /^[a-zA-Z0-9_.:-]{0,100}$/.test(params.error) ? params.error : ""} reportId={typeof params.report === "string" ? params.report.slice(0,100) : ""} /></div>
  </section>;
}
