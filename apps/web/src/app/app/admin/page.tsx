import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";
import {
  Bell,
  CalendarDays,
  CircleAlert,
  ClipboardList,
  CreditCard,
  FileText,
  Search,
  ShieldCheck,
  Wrench
} from "lucide-react";

import { auth } from "@/auth";
import {
  formatInspectionStatusLabel,
  getAdminDashboardData,
  isDueAtTimeOfServiceCustomer,
  pickEarliestNextDueAt
} from "@testworx/lib";

import { createInspectionAction } from "./actions";
import { InspectionSchedulerForm } from "./inspection-scheduler-form";

type AdminDashboardData = Awaited<ReturnType<typeof getAdminDashboardData>>;
type CompletedDashboardInspection = AdminDashboardData["completedInspections"][number];
type ActiveDashboardInspection = AdminDashboardData["activeInspections"][number];
type DashboardInspection = CompletedDashboardInspection | ActiveDashboardInspection;
type DashboardTask = DashboardInspection["tasks"][number];

function inspectionStatusLabel(status: string) {
  return formatInspectionStatusLabel(
    status as
      | "past_due"
      | "to_be_completed"
      | "scheduled"
      | "in_progress"
      | "completed"
      | "cancelled"
  );
}

function taskDisplayLabel(task: { inspectionType: string; displayLabel?: string }) {
  return task.displayLabel ?? task.inspectionType.replaceAll("_", " ");
}

function getGreetingName(name?: string | null) {
  return name?.trim().split(/\s+/)[0] || "there";
}

function getGreetingByHour(date: Date) {
  const hour = date.getHours();
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
}

function formatScheduleDetail(inspection: DashboardInspection) {
  const taskSummary = inspection.tasks.length
    ? inspection.tasks.map((task) => taskDisplayLabel(task)).join(", ")
    : "Inspection workflow";
  const technicianSummary = inspection.assignedTechnicianNames.length
    ? `${inspection.assignedTechnicianNames.length} tech${inspection.assignedTechnicianNames.length === 1 ? "" : "s"} assigned`
    : "Shared queue";

  return `${taskSummary} • ${technicianSummary}`;
}

function buildActivityItems(
  inspections: CompletedDashboardInspection[]
): Array<{ title: string; meta: string; tag: string; href: string }> {
  return inspections.slice(0, 4).map((inspection) => ({
    title: `${inspection.primaryTitle ?? inspection.site.name} finalized`,
    meta: `${inspection.secondaryTitle ?? inspection.customerCompany.name} • ${format(
      inspection.scheduledStart,
      "MMM d, yyyy h:mm a"
    )}`,
    tag: inspection.billingStatus
      ? inspection.billingStatus.replaceAll("_", " ")
      : "Completed",
    href: `/app/admin/inspections/${inspection.id}`
  }));
}

function buildAlertItems(data: AdminDashboardData, inspectionNotice?: string) {
  const alerts: string[] = [];

  if (inspectionNotice === "deleted") {
    alerts.push("Inspection deleted successfully.");
  }

  const dueAtServiceCount = data.activeInspections.filter((inspection) =>
    isDueAtTimeOfServiceCustomer(inspection.customerCompany)
  ).length;
  if (dueAtServiceCount > 0) {
    alerts.push(
      `${dueAtServiceCount} inspection${dueAtServiceCount === 1 ? "" : "s"} require payment collection on site today.`
    );
  }

  if (data.summary.unassignedInspections > 0) {
    alerts.push(
      `${data.summary.unassignedInspections} inspection${data.summary.unassignedInspections === 1 ? "" : "s"} are still sitting in the shared queue.`
    );
  }

  const reviewedBillingCount = data.completedInspections.filter(
    (inspection) => inspection.billingStatus === "reviewed"
  ).length;
  if (reviewedBillingCount > 0) {
    alerts.push(
      `${reviewedBillingCount} completed report${reviewedBillingCount === 1 ? "" : "s"} are ready for billing review.`
    );
  }

  const amendedCount = data.activeInspections.filter(
    (inspection) => inspection.lifecycle === "replacement" || inspection.lifecycle === "amended"
  ).length;
  if (amendedCount > 0) {
    alerts.push(
      `${amendedCount} active inspection${amendedCount === 1 ? "" : "s"} were recently amended and should be double-checked before dispatch.`
    );
  }

  return alerts.slice(0, 3);
}

function calculateBillingPipeline(
  inspections: CompletedDashboardInspection[]
): Array<{ label: string; value: number; tone: string }> {
  const total = inspections.length || 1;
  const draft = inspections.filter((inspection) => !inspection.billingStatus || inspection.billingStatus === "draft").length;
  const reviewed = inspections.filter((inspection) => inspection.billingStatus === "reviewed").length;
  const invoiced = inspections.filter((inspection) => inspection.billingStatus === "invoiced").length;

  return [
    {
      label: "Draft billing",
      value: Math.round((draft / total) * 100),
      tone: "bg-slate-900"
    },
    {
      label: "Awaiting approval",
      value: Math.round((reviewed / total) * 100),
      tone: "bg-[#1f4678]"
    },
    {
      label: "Ready to invoice",
      value: Math.round((invoiced / total) * 100),
      tone: "bg-emerald-500"
    }
  ];
}

function formatMoneyDueCount(inspections: CompletedDashboardInspection[]) {
  const reviewedCount = inspections.filter((inspection) => inspection.billingStatus === "reviewed").length;
  return {
    value: reviewedCount.toString(),
    change: reviewedCount ? "Ready for invoice review" : "No billing items queued"
  };
}

function InspectionListCard({
  title,
  description,
  inspections,
  emptyText,
  ctaLabel
}: {
  title: string;
  description: string;
  inspections: DashboardInspection[];
  emptyText: string;
  ctaLabel: string;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div>
        <h3 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>

      <div className="mt-5 space-y-3">
        {inspections.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-500">
            {emptyText}
          </div>
        ) : (
          inspections.map((inspection) => {
            const nextDue = pickEarliestNextDueAt(
              inspection.tasks.map((task: DashboardTask) => task.recurrence?.nextDueAt)
            );

            return (
              <div
                key={inspection.id}
                className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">
                      {inspection.primaryTitle ?? inspection.site.name}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {inspection.secondaryTitle ?? inspection.customerCompany.name} •{" "}
                      {format(inspection.scheduledStart, "MMM d, yyyy h:mm a")}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {inspection.tasks.map((task) => taskDisplayLabel(task)).join(", ") || "Inspection workflow"}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      Next due: {nextDue ? format(new Date(nextDue), "MMM d, yyyy") : "One-time"}
                    </div>
                  </div>
                  <Link
                    className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    href={`/app/admin/inspections/${inspection.id}`}
                  >
                    {ctaLabel}
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

export default async function AdminPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const data = await getAdminDashboardData({
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  });
  const params = searchParams ? await searchParams : {};
  const inspectionNotice = Array.isArray(params.inspection)
    ? params.inspection[0]
    : params.inspection;

  const greeting = getGreetingByHour(new Date());
  const firstName = getGreetingName(session.user.name);
  const openInspections = data.summary.upcomingInspections;
  const reportsAwaitingReview = data.completedInspections.filter(
    (inspection) => inspection.billingStatus !== "invoiced"
  ).length;
  const billingReady = formatMoneyDueCount(data.completedInspections);
  const complianceFlags = buildAlertItems(data, inspectionNotice).length;
  const todayItems = data.activeInspections.slice(0, 3);
  const activityItems = buildActivityItems(data.completedInspections);
  const alerts = buildAlertItems(data, inspectionNotice);
  const billingPipeline = calculateBillingPipeline(data.completedInspections);

  const statCards = [
    {
      label: "Open inspections",
      value: openInspections.toString(),
      change: `${data.activeInspections.length} on the live board`,
      icon: ClipboardList
    },
    {
      label: "Reports awaiting review",
      value: reportsAwaitingReview.toString(),
      change: reportsAwaitingReview ? "Completed work still needs office review" : "Review queue is clear",
      icon: FileText
    },
    {
      label: "Billing ready",
      value: billingReady.value,
      change: billingReady.change,
      icon: CreditCard
    },
    {
      label: "Compliance flags",
      value: complianceFlags.toString(),
      change: complianceFlags ? "Needs follow-up today" : "No urgent flags surfaced",
      icon: ShieldCheck
    }
  ];

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-6 lg:px-8 lg:py-8">
        <div className="rounded-[28px] border border-white/80 bg-white/70 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur">
          <div className="flex flex-col gap-6 border-b border-slate-200/80 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="flex items-center gap-4">
              <div className="inline-flex h-11 items-center rounded-full border border-slate-200 bg-white px-4 text-[11px] font-semibold tracking-[0.24em] text-slate-500 shadow-sm">
                TRADEWORX
              </div>
              <div>
                <div className="text-sm font-medium text-slate-500">Operations dashboard</div>
                <h1 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-[30px]">
                  {greeting}, {firstName}.
                </h1>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-[260px] flex-1 sm:min-w-[320px]">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  placeholder="Search inspections, reports, customers"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-11 text-sm text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-[#1f4678] focus:ring-4 focus:ring-[#1f4678]/10"
                />
              </div>
              <div className="flex items-center gap-3">
                <Link
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  href="/app/deficiencies"
                >
                  <Bell className="h-4 w-4" />
                  Alerts
                </Link>
                <a
                  className="inline-flex h-12 items-center rounded-2xl bg-[#1f4678] px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(31,70,120,0.20)] transition duration-150 hover:brightness-110 active:scale-[0.99]"
                  href="#create-inspection"
                >
                  New inspection
                </a>
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[1.35fr_0.95fr] lg:px-8 lg:py-8">
            <div className="space-y-6">
              <section className="relative overflow-hidden rounded-[28px] bg-[#1f4678] px-6 py-6 text-white shadow-[0_22px_60px_rgba(31,70,120,0.18)]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(0,0,0,0.14),transparent_42%)]" />
                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="text-[11px] font-semibold tracking-[0.24em] text-white/70">
                      TODAY&apos;S OPERATIONS
                    </div>
                    <h2 className="mt-3 max-w-[14ch] text-3xl font-semibold tracking-[-0.05em] sm:text-[42px] sm:leading-[1.02]">
                      Keep field work moving without losing billing and reporting.
                    </h2>
                    <p className="mt-4 max-w-2xl text-base leading-7 text-white/80">
                      Review inspections, follow up on deficiencies, and finalize revenue-ready work from one calm workspace.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:w-[320px]">
                    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                      <div className="text-sm text-white/70">Techs active</div>
                      <div className="mt-1 text-2xl font-semibold">{data.technicians.length}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                      <div className="text-sm text-white/70">Jobs today</div>
                      <div className="mt-1 text-2xl font-semibold">{todayItems.length}</div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {statCards.map(({ label, value, change, icon: Icon }) => (
                  <div
                    key={label}
                    className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-slate-500">{label}</div>
                        <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                          {value}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-slate-100 p-2.5 text-slate-700">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-4 text-sm text-slate-500">{change}</div>
                  </div>
                ))}
              </section>

              <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
                <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                        Today&apos;s field schedule
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Live view of inspections and service work assigned today.
                      </p>
                    </div>
                    <Link
                      className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 px-3.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      href="/app/admin/amendments"
                    >
                      <CalendarDays className="h-4 w-4" />
                      Calendar
                    </Link>
                  </div>

                  <div className="mt-5 space-y-3">
                    {todayItems.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-500">
                        No active inspections are scheduled right now.
                      </div>
                    ) : (
                      todayItems.map((item) => (
                        <Link
                          key={item.id}
                          href={`/app/admin/inspections/${item.id}`}
                          className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 transition hover:border-slate-300 hover:bg-white sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900">
                              {item.primaryTitle ?? item.site.name}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              {formatScheduleDetail(item)}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                            <div className="text-sm font-medium text-slate-700">
                              {format(item.scheduledStart, "h:mm a")}
                            </div>
                            <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                              {inspectionStatusLabel(item.displayStatus)}
                            </div>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
                  <h3 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                    Recent activity
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Important actions across reporting, billing, and customer delivery.
                  </p>

                  <div className="mt-5 space-y-4">
                    {activityItems.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-500">
                        No completed activity has been recorded yet.
                      </div>
                    ) : (
                      activityItems.map((item) => (
                        <Link key={item.title} href={item.href} className="flex gap-3 transition hover:opacity-80">
                          <div className="mt-1 rounded-full bg-slate-100 p-2 text-slate-700">
                            <Wrench className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                              <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-600">
                                {item.tag}
                              </div>
                            </div>
                            <div className="mt-1 text-sm text-slate-500">{item.meta}</div>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <InspectionListCard
                  title="Active inspections"
                  description={`Operational schedule view with ${data.activeInspections.length} inspection${data.activeInspections.length === 1 ? "" : "s"} loaded right now.`}
                  inspections={data.activeInspections}
                  emptyText="No active inspections are on the board right now."
                  ctaLabel="Open inspection"
                />
                <InspectionListCard
                  title="Completed archive"
                  description="Recently completed visits that are ready for office follow-up, billing, or customer delivery."
                  inspections={data.completedInspections.slice(0, 6)}
                  emptyText="No completed inspections yet."
                  ctaLabel="View inspection"
                />
              </section>
            </div>

            <div className="space-y-6">
              <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <CircleAlert className="h-4 w-4 text-amber-500" />
                  Needs attention
                </div>
                <div className="mt-4 space-y-3">
                  {alerts.length === 0 ? (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm leading-6 text-emerald-800">
                      Nothing urgent is blocking today&apos;s operations.
                    </div>
                  ) : (
                    alerts.map((alert) => (
                      <div
                        key={alert}
                        className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm leading-6 text-slate-700"
                      >
                        {alert}
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                      Revenue pipeline
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Operational work that is closest to billing completion.
                    </p>
                  </div>
                  <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    {data.completedInspections.some((inspection) => inspection.billingStatus === "reviewed")
                      ? "Active"
                      : "Healthy"}
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {billingPipeline.map((bar) => (
                    <div key={bar.label}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">{bar.label}</span>
                        <span className="text-slate-500">{bar.value}%</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-100">
                        <div
                          className={`h-2.5 rounded-full ${bar.tone}`}
                          style={{ width: `${Math.max(bar.value, 4)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-200/80 bg-[#0f172a] p-6 text-white shadow-[0_16px_44px_rgba(15,23,42,0.14)]">
                <div className="text-[11px] font-semibold tracking-[0.24em] text-white/60">
                  QUICK ACTIONS
                </div>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                  Move the work forward.
                </h3>
                <p className="mt-2 text-sm leading-7 text-white/72">
                  Open the tasks that most directly affect customer delivery and collected revenue.
                </p>

                <div className="mt-5 space-y-3">
                  {[
                    { label: "Finalize pending reports", href: "/app/admin/billing" },
                    { label: "Review auto-generated billing", href: "/app/admin/billing" },
                    { label: "Follow up on open deficiencies", href: "/app/deficiencies" }
                  ].map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-left text-sm font-medium text-white transition hover:bg-white/10"
                    >
                      <span>{item.label}</span>
                      <span className="text-white/50">→</span>
                    </Link>
                  ))}
                </div>
              </section>

              <section id="create-inspection">
                <InspectionSchedulerForm
                  action={createInspectionAction}
                  title="Create inspection"
                  submitLabel="Create inspection"
                  customers={data.customers}
                  sites={data.sites}
                  technicians={data.technicians}
                  allowDocumentUpload
                  autoSelectGenericSiteOnCustomerChange
                  allowCustomOneTimeSite
                />
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
