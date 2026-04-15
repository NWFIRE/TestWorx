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
  getAdminDeficiencyDashboardData,
  getAdminReportReviewQueueData,
  getAdminSchedulingQueueData,
  getInspectionStatusTone,
  isDueAtTimeOfServiceCustomer,
  pickEarliestNextDueAt
} from "@testworx/lib";

import {
  AppPageShell,
  EmptyState,
  KPIStatCard,
  PageHeader,
  SectionCard,
  StatusBadge,
  WorkQueueNav,
  WorkspaceSplit
} from "../operations-ui";

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
      | "invoiced"
      | "cancelled"
      | "follow_up_required"
  );
}

function taskDisplayLabel(task: { inspectionType: string; displayLabel?: string }) {
  return task.displayLabel ?? task.inspectionType.replaceAll("_", " ");
}

function getGreetingName(name?: string | null) {
  return name?.trim().split(/\s+/)[0] || "there";
}

function getGreetingByHour(date: Date, timezone?: string | null) {
  let hour = date.getHours();

  if (timezone) {
    try {
      const formattedHour = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: timezone
      }).format(date);
      const parsedHour = Number(formattedHour);
      if (Number.isFinite(parsedHour)) {
        hour = parsedHour;
      }
    } catch {
      // Fall back to the server/runtime hour if the tenant timezone is invalid.
    }
  }

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
  return inspections.slice(0, 3).map((inspection) => ({
    title: `${inspection.primaryTitle ?? inspection.site.name} finalized`,
    meta: `${inspection.secondaryTitle ?? inspection.customerCompany.name} • ${format(
      inspection.scheduledStart,
      "MMM d, yyyy h:mm a"
    )}`,
    tag: inspection.billingStatus ? inspection.billingStatus.replaceAll("_", " ") : "Completed",
    href: `/app/admin/inspections/${inspection.id}?from=${encodeURIComponent("/app/admin/dashboard")}`
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
  const draft = inspections.filter(
    (inspection) => !inspection.billingStatus || inspection.billingStatus === "draft"
  ).length;
  const reviewed = inspections.filter(
    (inspection) => inspection.billingStatus === "reviewed"
  ).length;
  const invoiced = inspections.filter(
    (inspection) => inspection.billingStatus === "invoiced"
  ).length;

  return [
    { label: "Draft billing", value: Math.round((draft / total) * 100), tone: "bg-slate-900" },
    { label: "Awaiting approval", value: Math.round((reviewed / total) * 100), tone: "bg-slateblue" },
    { label: "Ready to invoice", value: Math.round((invoiced / total) * 100), tone: "bg-emerald-500" }
  ];
}

function formatBillingReady(inspections: CompletedDashboardInspection[]) {
  const reviewedCount = inspections.filter(
    (inspection) => inspection.billingStatus === "reviewed"
  ).length;

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
  ctaLabel,
  detailHrefBase,
  emptyTitle = "Nothing is queued here"
}: {
  title: string;
  description: string;
  inspections: DashboardInspection[];
  emptyText: string;
  ctaLabel: string;
  detailHrefBase: string;
  emptyTitle?: string;
}) {
  return (
    <SectionCard>
      <div>
        <h3 className="text-lg font-semibold tracking-[-0.03em] text-slate-950 lg:text-xl">
          {title}
        </h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>

      <div className="mt-5 space-y-3">
        {inspections.length === 0 ? (
          <EmptyState description={emptyText} title={emptyTitle} />
        ) : (
          inspections.map((inspection) => {
            const nextDue = pickEarliestNextDueAt(
              inspection.tasks.map((task: DashboardTask) => task.recurrence?.nextDueAt)
            );

            return (
              <div
                key={inspection.id}
                className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 transition hover:border-slate-300 hover:bg-white"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">
                      {inspection.primaryTitle ?? inspection.site.name}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-slate-500">
                      {inspection.secondaryTitle ?? inspection.customerCompany.name} •{" "}
                      {format(inspection.scheduledStart, "MMM d, yyyy h:mm a")}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-slate-500">
                      {inspection.tasks.map((task) => taskDisplayLabel(task)).join(", ") ||
                        "Inspection workflow"}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-slate-500">
                      Next due: {nextDue ? format(new Date(nextDue), "MMM d, yyyy") : "One-time"}
                    </div>
                  </div>
                  <Link
                    className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    href={`/app/admin/inspections/${inspection.id}?from=${encodeURIComponent(detailHrefBase)}`}
                  >
                    {ctaLabel}
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </SectionCard>
  );
}

export default async function AdminDashboardPage({
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

  const actor = {
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  };

  const [data, schedulingQueueData, reportReviewData, deficiencyData] = await Promise.all([
    getAdminDashboardData({
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    }),
    getAdminSchedulingQueueData(actor, { statuses: ["to_be_completed", "scheduled", "in_progress", "follow_up_required"] }),
    getAdminReportReviewQueueData(actor),
    getAdminDeficiencyDashboardData(
      actor,
      { status: "open" }
    )
  ]);
  const params = searchParams ? await searchParams : {};
  const inspectionNotice = Array.isArray(params.inspection)
    ? params.inspection[0]
    : params.inspection;

  const greeting = getGreetingByHour(new Date(), data.timezone);
  const firstName = getGreetingName(session.user.name);
  const openInspectionCount = schedulingQueueData.inspections.length;
  const reportsAwaitingReview = reportReviewData.counts.awaitingReview;
  const billingReady = formatBillingReady(data.completedInspections);
  const alerts = buildAlertItems(data, inspectionNotice);
  const complianceFlags = deficiencyData.deficiencies.filter(
    (deficiency) => deficiency.severity === "high" || deficiency.severity === "critical"
  ).length;
  const todayItems = data.activeInspections.slice(0, 3);
  const activityItems = buildActivityItems(data.completedInspections);
  const billingPipeline = calculateBillingPipeline(data.completedInspections);

  const statCards = [
    {
      label: "Open inspections",
      value: openInspectionCount.toString(),
      change: openInspectionCount
        ? `${schedulingQueueData.counts.inProgress} currently in progress`
        : "Dispatch queue is clear",
      icon: ClipboardList,
      href: "/app/admin/inspections?status=open",
      tone: "blue" as const
    },
    {
      label: "Reports awaiting review",
      value: reportsAwaitingReview.toString(),
      change: reportsAwaitingReview
        ? "Completed work still needs office review"
        : "Review queue is clear",
      icon: FileText,
      href: "/app/admin/reports?status=awaiting-review",
      tone: "violet" as const
    },
    {
      label: "Billing ready",
      value: billingReady.value,
      change: billingReady.change,
      icon: CreditCard,
      href: "/app/admin/billing?status=ready",
      tone: "emerald" as const
    },
    {
      label: "Compliance flags",
      value: complianceFlags.toString(),
      change: complianceFlags ? "Open high-priority issues need follow-up" : "No open high-priority flags",
      icon: ShieldCheck,
      href: "/app/deficiencies?status=open&severity=high,critical",
      tone: "amber" as const
    }
  ];

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <div className="py-5 lg:py-6">
        <AppPageShell density="wide">
          <div className="lg:hidden">
            <PageHeader
              actions={
                <Link
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
                  href="/app/deficiencies"
                >
                  <Bell className="h-4 w-4" />
                </Link>
              }
              description=""
              eyebrow="Dashboard"
              title={`${greeting}, ${firstName}.`}
              contentWidth="full"
            />
          </div>

          <div className="hidden lg:block">
            <PageHeader
              actions={
                <>
                  <div className="relative min-w-[280px] flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      placeholder="Search inspections, reports, customers"
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-11 text-sm text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-slateblue focus:ring-4 focus:ring-slateblue/10"
                    />
                  </div>
                  <Link
                    className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    href="/app/deficiencies"
                  >
                    <Bell className="h-4 w-4" />
                    Alerts
                  </Link>
                  <Link
                    className="inline-flex h-12 items-center rounded-2xl bg-slateblue px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgb(var(--tenant-primary-rgb)_/_0.2)] transition duration-150 hover:brightness-110 active:scale-[0.99]"
                    href="/app/admin/inspections?create=1"
                  >
                    Open inspections
                  </Link>
                </>
              }
              description=""
              eyebrow="Dashboard"
              title={`${greeting}, ${firstName}.`}
              contentWidth="full"
            />
          </div>

          <div className="lg:hidden">
            <SectionCard className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  placeholder="Search inspections, reports, customers"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-11 text-sm text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-slateblue focus:ring-4 focus:ring-slateblue/10"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Link
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  href="/app/deficiencies"
                >
                  Alerts
                </Link>
                <Link
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-slateblue text-sm font-semibold text-white shadow-[0_12px_24px_rgb(var(--tenant-primary-rgb)_/_0.18)] transition hover:brightness-110 active:scale-[0.99]"
                  href="/app/admin/inspections?create=1"
                >
                  Open inspections
                </Link>
              </div>
            </SectionCard>
          </div>

          <section className="grid gap-3 lg:grid-cols-4 lg:gap-4">
            {statCards.map(({ label, value, change, icon: Icon, href, tone }) => (
              <KPIStatCard
                href={href}
                icon={<Icon className="h-4 w-4 lg:h-5 lg:w-5" />}
                key={label}
                label={label}
                note={change}
                tone={tone}
                value={value}
              />
            ))}
          </section>

          <WorkQueueNav activeKey="all" />

          <WorkspaceSplit className="gap-5" variant="content-heavy">
            <div className="space-y-5 lg:space-y-6">
              <section className="relative overflow-hidden rounded-[28px] bg-slateblue p-5 text-white shadow-[0_20px_50px_rgb(var(--tenant-primary-rgb)_/_0.18)] lg:px-6 lg:py-6 lg:shadow-[0_22px_60px_rgb(var(--tenant-primary-rgb)_/_0.18)]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(0,0,0,0.14),transparent_42%)]" />
                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="text-[10px] font-semibold tracking-[0.24em] text-white/70 lg:text-[11px]">
                      TODAY&apos;S OPERATIONS
                    </div>
                    <h2 className="mt-3 max-w-[14ch] text-[32px] font-semibold leading-[1] tracking-[-0.05em] lg:text-[42px] lg:leading-[1.02]">
                      Keep field work moving.
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-white/80 lg:mt-4 lg:max-w-2xl lg:text-base">
                      Review inspections, finalize reports, and keep billing close to done.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 lg:w-[360px]">
                    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                      <div className="text-xs text-white/70">Techs active</div>
                      <div className="mt-1 text-2xl font-semibold">{data.technicians.length}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                      <div className="text-xs text-white/70">Jobs today</div>
                      <div className="mt-1 text-2xl font-semibold">{todayItems.length}</div>
                    </div>
                  </div>
                </div>
              </section>

              <WorkspaceSplit className="gap-5" variant="balanced">
                <SectionCard>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold tracking-[-0.03em] text-slate-950 lg:text-xl">
                        Today&apos;s field schedule
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Live operational work ordered for quick scanning and action.
                      </p>
                    </div>
                    <Link
                      className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-700 transition hover:bg-slate-50 lg:h-10 lg:w-auto lg:gap-2 lg:px-3.5 lg:text-sm lg:font-medium"
                      href="/app/admin/amendments"
                    >
                      <CalendarDays className="h-4 w-4" />
                      <span className="hidden lg:inline">Inspection Review</span>
                    </Link>
                  </div>

                  <div className="mt-4 space-y-3">
                    {todayItems.length === 0 ? (
                      <EmptyState
                        description="No active inspections are scheduled right now."
                        title="Nothing is currently on deck"
                      />
                    ) : (
                      todayItems.map((item) => (
                        <Link
                          key={item.id}
                          href={`/app/admin/inspections/${item.id}?from=${encodeURIComponent("/app/admin/dashboard")}`}
                          className="block rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 transition hover:border-slate-300 hover:bg-white"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {item.primaryTitle ?? item.site.name}
                              </div>
                              <div className="mt-1 text-sm leading-6 text-slate-500">
                                {formatScheduleDetail(item)}
                              </div>
                            </div>
                            <div className="text-xs font-medium text-slate-700">
                              {format(item.scheduledStart, "h:mm a")}
                            </div>
                          </div>
                          <div className="mt-3">
                            <StatusBadge
                              label={inspectionStatusLabel(item.displayStatus)}
                              tone={getInspectionStatusTone(item.displayStatus as Parameters<typeof getInspectionStatusTone>[0])}
                            />
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </SectionCard>

                <SectionCard>
                  <h3 className="text-lg font-semibold tracking-[-0.03em] text-slate-950 lg:text-xl">
                    Recent activity
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Important movement across reporting, billing, and customer delivery.
                  </p>

                  <div className="mt-4 space-y-4">
                    {activityItems.length === 0 ? (
                      <EmptyState
                        description="No completed activity has been recorded yet."
                        title="No recent activity"
                      />
                    ) : (
                      activityItems.map((item) => (
                        <Link
                          key={item.title}
                          href={item.href}
                          className="flex gap-3 rounded-2xl p-1 transition hover:bg-slate-50"
                        >
                          <div className="mt-1 rounded-full bg-slate-100 p-2 text-slate-700">
                            <Wrench className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-sm font-semibold leading-6 text-slate-900">
                                {item.title}
                              </div>
                              <StatusBadge label={item.tag} tone="slate" />
                            </div>
                            <div className="mt-1 text-sm leading-6 text-slate-500">{item.meta}</div>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </SectionCard>
              </WorkspaceSplit>

              <section className="grid gap-5 2xl:grid-cols-2">
                <InspectionListCard
                  title="Active inspections"
                  description={`Operational schedule view with ${data.activeInspections.length} inspection${data.activeInspections.length === 1 ? "" : "s"} loaded right now.`}
                  detailHrefBase="/app/admin/dashboard"
                  inspections={data.activeInspections}
                  emptyText="No active inspections are on the board right now."
                  emptyTitle="No active inspections"
                  ctaLabel="Open inspection"
                />
                <InspectionListCard
                  title="Completed archive"
                  description="Recently completed visits that are ready for office follow-up, billing, or customer delivery."
                  detailHrefBase="/app/admin/dashboard"
                  inspections={data.completedInspections.slice(0, 6)}
                  emptyText="No completed inspections yet."
                  emptyTitle="No completed archive items"
                  ctaLabel="View inspection"
                />
              </section>
            </div>

            <div className="space-y-5 lg:space-y-6">
              <SectionCard>
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
              </SectionCard>

              <SectionCard>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold tracking-[-0.03em] text-slate-950 lg:text-xl">
                      Revenue pipeline
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Operational work that is closest to billing completion.
                    </p>
                  </div>
                  <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    {data.completedInspections.some(
                      (inspection) => inspection.billingStatus === "reviewed"
                    )
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
              </SectionCard>

              <section className="rounded-[28px] border border-slate-200/80 bg-[#0f172a] p-5 text-white shadow-[0_16px_44px_rgba(15,23,42,0.14)] lg:p-6">
                <div className="text-[10px] font-semibold tracking-[0.24em] text-white/60">
                  QUICK ACTIONS
                </div>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                  Move the work forward.
                </h3>
                <p className="mt-2 text-sm leading-7 text-white/72">
                  Open the tasks that most directly affect delivery and collected revenue.
                </p>

                <div className="mt-5 space-y-3">
                  {[
                    { label: "Finalize pending reports", href: "/app/admin/reports?status=awaiting-review" },
                    { label: "Review auto-generated billing", href: "/app/admin/billing?status=ready" },
                    { label: "Follow up on open deficiencies", href: "/app/deficiencies?status=open" }
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

            </div>
          </WorkspaceSplit>
        </AppPageShell>
      </div>
    </div>
  );
}
