import "server-only";
import { prisma } from "@testworx/db";
import { format } from "date-fns";

// Persist the link as part of the same locked transaction that creates a schedule.
// Otherwise advancing nextDueDate makes the next page load create another schedule.
export async function bindCompletedTaskSchedule(tenantId: string, taskId: string) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`schedule-backfill:${tenantId}`}, 0))`;
    const task = await tx.inspectionTask.findFirst({
      where: { id: taskId, tenantId, serviceScheduleId: null, inspection: { status: { in: ["completed", "invoiced"] } } },
      include: { recurrence: true, inspection: { select: { customerCompanyId: true, siteId: true } } }
    });
    if (!task?.recurrence?.nextDueAt || task.recurrence.frequency === "ONCE") return false;
    const recurrence = task.recurrence;
    const due = recurrence.nextDueAt!;
    const scope = { tenantId, customerCompanyId: task.inspection.customerCompanyId, siteId: task.inspection.siteId, reportType: task.inspectionType, cadence: recurrence.frequency };
    const existing = await tx.serviceSchedule.findFirst({
      where: { ...scope, OR: [
        { tasks: { some: { tenantId, recurrence: { is: { seriesId: recurrence.seriesId } } } } },
        { nextDueDate: due, isActive: true, tasks: { none: { inspectionId: task.inspectionId, id: { not: task.id } } } }
      ] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true }
    });
    const schedule = existing ?? await tx.serviceSchedule.create({ data: {
      ...scope, serviceType: task.inspectionType, nextDueDate: due,
      dueMonth: format(due, "yyyy-MM"), dueDayOrWindow: format(due, "yyyy-MM-dd"), isActive: true
    }, select: { id: true } });
    await tx.inspectionTask.update({ where: { id: task.id }, data: { serviceScheduleId: schedule.id } });
    return !existing;
  }, { timeout: 15000 });
}
