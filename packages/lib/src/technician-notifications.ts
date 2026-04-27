import "server-only";

import {
  InspectionStatus,
  MobileDevicePlatform,
  Prisma,
  TechnicianNotificationPriority,
  TechnicianNotificationRelatedEntityType,
  TechnicianNotificationType
} from "@prisma/client";
import { prisma } from "@testworx/db";
import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { activeOperationalInspectionStatuses, formatInspectionTaskTypeLabel, formatUserFacingSiteContext, getCustomerFacingSiteLabel } from "./scheduling";
import { assertTenantContext } from "./permissions";

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

type NotificationMetadata = {
  basePath?: string;
  inspectionId?: string;
  taskId?: string;
};

export type TechnicianNotificationListItem = {
  id: string;
  type: TechnicianNotificationType;
  title: string;
  body: string;
  priority: TechnicianNotificationPriority;
  createdAt: string;
  isRead: boolean;
  href: string;
  relatedEntityType: TechnicianNotificationRelatedEntityType;
  relatedEntityId: string;
};

export type TechnicianNotificationSummary = {
  items: TechnicianNotificationListItem[];
  counts: {
    total: number;
    iconBadge: number;
    work: number;
    inspections: number;
  };
  lastUpdatedAt: string;
};

function readNotificationMetadata(value: Prisma.JsonValue | null | undefined): NotificationMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const metadata = value as Record<string, unknown>;
  return {
    basePath: typeof metadata.basePath === "string" ? metadata.basePath : undefined,
    inspectionId: typeof metadata.inspectionId === "string" ? metadata.inspectionId : undefined,
    taskId: typeof metadata.taskId === "string" ? metadata.taskId : undefined
  };
}

function appendNotificationQuery(basePath: string, notificationId: string) {
  return basePath.includes("?")
    ? `${basePath}&notification=${encodeURIComponent(notificationId)}`
    : `${basePath}?notification=${encodeURIComponent(notificationId)}`;
}

function defaultNotificationPath(input: {
  id: string;
  relatedEntityType: TechnicianNotificationRelatedEntityType;
  relatedEntityId: string;
  metadata: NotificationMetadata;
}) {
  if (input.metadata.basePath) {
    return appendNotificationQuery(input.metadata.basePath, input.id);
  }

  if (input.metadata.inspectionId && input.metadata.taskId) {
    return appendNotificationQuery(`/app/tech/reports/${input.metadata.inspectionId}/${input.metadata.taskId}`, input.id);
  }

  if (input.relatedEntityType === "report" && input.metadata.inspectionId) {
    return appendNotificationQuery(`/app/tech/inspections?inspectionId=${encodeURIComponent(input.metadata.inspectionId)}`, input.id);
  }

  if (input.relatedEntityType === "inspection" || input.relatedEntityType === "work_order") {
    return appendNotificationQuery(`/app/tech/work?inspectionId=${encodeURIComponent(input.relatedEntityId)}`, input.id);
  }

  return appendNotificationQuery("/app/tech/profile", input.id);
}

export function buildTechnicianNotificationHref(input: {
  id: string;
  relatedEntityType: TechnicianNotificationRelatedEntityType;
  relatedEntityId: string;
  metadata?: Prisma.JsonValue | null;
}) {
  return defaultNotificationPath({
    id: input.id,
    relatedEntityType: input.relatedEntityType,
    relatedEntityId: input.relatedEntityId,
    metadata: readNotificationMetadata(input.metadata)
  });
}

function isInspectionBadgeType(type: TechnicianNotificationType) {
  return type === TechnicianNotificationType.inspection_reissued_for_correction;
}

function isWorkBadgeType(type: TechnicianNotificationType) {
  return !isInspectionBadgeType(type);
}

export function splitTechnicianUnreadCounts(
  notifications: Array<{ type: TechnicianNotificationType; isRead: boolean }>
) {
  const unread = notifications.filter((notification) => !notification.isRead);
  return {
    total: unread.length,
    work: unread.filter((notification) => isWorkBadgeType(notification.type)).length,
    inspections: unread.filter((notification) => isInspectionBadgeType(notification.type)).length
  };
}

async function syncDeviceBadgeCount(tenantId: string, userId: string) {
  const unreadCount = await prisma.technicianNotification.count({
    where: {
      tenantId,
      userId,
      isRead: false,
      isDismissed: false
    }
  });

  await prisma.technicianDeviceRegistration.updateMany({
    where: { tenantId, userId, isActive: true },
    data: {
      lastBadgeCount: unreadCount,
      lastSeenAt: new Date()
    }
  });

  return unreadCount;
}

async function createOrRefreshNotificationTx(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    userId: string;
    type: TechnicianNotificationType;
    title: string;
    body: string;
    relatedEntityType: TechnicianNotificationRelatedEntityType;
    relatedEntityId: string;
    priority: TechnicianNotificationPriority;
    metadata?: Prisma.InputJsonValue;
  }
) {
  const existing = await tx.technicianNotification.findFirst({
    where: {
      tenantId: input.tenantId,
      userId: input.userId,
      type: input.type,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      isDismissed: false
    },
    orderBy: { createdAt: "desc" }
  });

  if (existing) {
    return tx.technicianNotification.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        body: input.body,
        priority: input.priority,
        metadata: input.metadata,
        isRead: false,
        readAt: null,
        createdAt: new Date()
      }
    });
  }

  return tx.technicianNotification.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      priority: input.priority,
      metadata: input.metadata
    }
  });
}

async function getInspectionNotificationContextTx(tx: Prisma.TransactionClient, inspectionId: string, tenantId: string) {
  const inspection = await tx.inspection.findFirst({
    where: { id: inspectionId, tenantId },
    include: {
      site: { select: { name: true } },
      customerCompany: { select: { name: true } },
      tasks: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          report: {
            select: {
              id: true,
              status: true,
              correctionState: true
            }
          }
        }
      }
    }
  });

  if (!inspection) {
    throw new Error("Inspection not found while building technician notification.");
  }

  const firstOpenTask = inspection.tasks.find((task) => task.report?.status !== "finalized") ?? inspection.tasks[0] ?? null;
  const displayTask = firstOpenTask ? formatInspectionTaskTypeLabel(firstOpenTask.inspectionType) : "Inspection";
  const displayContext = formatUserFacingSiteContext({
    siteName: inspection.site.name,
    customerName: inspection.customerCompany.name,
    fallback: "This inspection"
  }) ?? "This inspection";

  return {
    inspection,
    displayContext,
    displayTask,
    basePath: firstOpenTask ? `/app/tech/reports/${inspection.id}/${firstOpenTask.id}` : `/app/tech/work?inspectionId=${inspection.id}`
  };
}

export async function createPriorityInspectionAssignedNotificationsTx(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    inspectionId: string;
    technicianIds: string[];
  }
) {
  if (!input.technicianIds.length) {
    return;
  }

  const context = await getInspectionNotificationContextTx(tx, input.inspectionId, input.tenantId);

  await Promise.all(
    input.technicianIds.map((userId) => {
      const metadata: Prisma.InputJsonValue = {
        basePath: context.basePath,
        inspectionId: context.inspection.id,
        ...(context.inspection.tasks[0]?.id ? { taskId: context.inspection.tasks[0].id } : {})
      };

      return createOrRefreshNotificationTx(tx, {
        tenantId: input.tenantId,
        userId,
        type: TechnicianNotificationType.priority_inspection_assigned,
        title: "Priority inspection assigned",
        body: `${context.displayContext} needs priority field action for ${context.displayTask}.`,
        relatedEntityType: TechnicianNotificationRelatedEntityType.inspection,
        relatedEntityId: context.inspection.id,
        priority: TechnicianNotificationPriority.urgent,
        metadata
      });
    })
  );
}

export async function createWorkOrderReassignedNotificationsTx(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    inspectionId: string;
    technicianIds: string[];
  }
) {
  if (!input.technicianIds.length) {
    return;
  }

  const context = await getInspectionNotificationContextTx(tx, input.inspectionId, input.tenantId);
  const hasWorkOrderTask = context.inspection.tasks.some((task) => task.inspectionType === "work_order");
  if (!hasWorkOrderTask) {
    return;
  }

  await Promise.all(
    input.technicianIds.map((userId) => {
      const metadata: Prisma.InputJsonValue = {
        basePath: context.basePath,
        inspectionId: context.inspection.id,
        ...(context.inspection.tasks[0]?.id ? { taskId: context.inspection.tasks[0].id } : {})
      };

      return createOrRefreshNotificationTx(tx, {
        tenantId: input.tenantId,
        userId,
        type: TechnicianNotificationType.work_order_reassigned,
        title: "Work order reassigned",
        body: `${context.displayContext} was reassigned and is ready for technician follow-up.`,
        relatedEntityType: TechnicianNotificationRelatedEntityType.work_order,
        relatedEntityId: context.inspection.id,
        priority: TechnicianNotificationPriority.high,
        metadata
      });
    })
  );
}

export async function createInspectionCorrectionReissuedNotificationTx(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    userId: string;
    inspectionId: string;
    taskId: string;
    reportId: string;
    siteName: string;
  }
) {
  await createOrRefreshNotificationTx(tx, {
    tenantId: input.tenantId,
    userId: input.userId,
    type: TechnicianNotificationType.inspection_reissued_for_correction,
    title: "Correction required",
    body: `${getCustomerFacingSiteLabel(input.siteName) ?? "This inspection"} was returned for correction and needs review.`,
    relatedEntityType: TechnicianNotificationRelatedEntityType.report,
    relatedEntityId: input.reportId,
    priority: TechnicianNotificationPriority.high,
    metadata: {
      basePath: `/app/tech/reports/${input.inspectionId}/${input.taskId}`,
      inspectionId: input.inspectionId,
      taskId: input.taskId
    }
  });
}

async function ensureOverdueNotifications(actor: ReturnType<typeof parseActor>) {
  const tenantId = actor.tenantId as string;
  const now = new Date();

  const overdueInspections = await prisma.inspection.findMany({
    where: {
      tenantId,
      scheduledStart: { lt: now },
      status: { in: [...activeOperationalInspectionStatuses] as InspectionStatus[] },
      OR: [
        { assignedTechnicianId: actor.userId },
        { technicianAssignments: { some: { technicianId: actor.userId } } }
      ]
    },
    include: {
      site: { select: { name: true } },
      customerCompany: { select: { name: true } },
      tasks: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          report: { select: { status: true } }
        }
      }
    }
  });

  await prisma.$transaction(async (tx) => {
    for (const inspection of overdueInspections) {
      const firstOpenTask = inspection.tasks.find((task) => task.report?.status !== "finalized") ?? inspection.tasks[0] ?? null;
      const displayContext = formatUserFacingSiteContext({
        siteName: inspection.site.name,
        customerName: inspection.customerCompany.name,
        fallback: "This inspection"
      }) ?? "This inspection";
      await createOrRefreshNotificationTx(tx, {
        tenantId,
        userId: actor.userId,
        type: TechnicianNotificationType.inspection_overdue,
        title: "Overdue inspection",
        body: `${displayContext} is overdue and needs field attention.`,
        relatedEntityType: TechnicianNotificationRelatedEntityType.inspection,
        relatedEntityId: inspection.id,
        priority: TechnicianNotificationPriority.high,
        metadata: {
          basePath: firstOpenTask ? `/app/tech/reports/${inspection.id}/${firstOpenTask.id}` : `/app/tech/work?inspectionId=${inspection.id}`,
          inspectionId: inspection.id,
          ...(firstOpenTask?.id ? { taskId: firstOpenTask.id } : {})
        }
      });
    }
  });
}

export async function getTechnicianNotificationSummary(actor: ActorContext): Promise<TechnicianNotificationSummary> {
  const parsedActor = parseActor(actor);
  if (parsedActor.role !== "technician") {
    throw new Error("Only technicians can access technician notifications.");
  }

  await ensureOverdueNotifications(parsedActor);

  const notifications = await prisma.technicianNotification.findMany({
    where: {
      tenantId: parsedActor.tenantId as string,
      userId: parsedActor.userId,
      isDismissed: false
    },
    orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
    take: 20
  });

  const unread = notifications.filter((notification) => !notification.isRead);
  const items = notifications.map((notification) => {
    const metadata = readNotificationMetadata(notification.metadata as Prisma.JsonValue | null | undefined);
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      priority: notification.priority,
      createdAt: notification.createdAt.toISOString(),
      isRead: notification.isRead,
      href: buildTechnicianNotificationHref({
        id: notification.id,
        relatedEntityType: notification.relatedEntityType,
        relatedEntityId: notification.relatedEntityId,
        metadata
      }),
      relatedEntityType: notification.relatedEntityType,
      relatedEntityId: notification.relatedEntityId
    } satisfies TechnicianNotificationListItem;
  });

  const iconBadge = await syncDeviceBadgeCount(parsedActor.tenantId as string, parsedActor.userId);

  const unreadCounts = splitTechnicianUnreadCounts(notifications);

  return {
    items,
    counts: {
      total: unreadCounts.total,
      iconBadge,
      work: unreadCounts.work,
      inspections: unreadCounts.inspections
    },
    lastUpdatedAt: new Date().toISOString()
  };
}

export async function markTechnicianNotificationRead(actor: ActorContext, notificationId: string) {
  const parsedActor = parseActor(actor);
  if (parsedActor.role !== "technician") {
    throw new Error("Only technicians can update technician notifications.");
  }

  await prisma.technicianNotification.updateMany({
    where: {
      id: notificationId,
      tenantId: parsedActor.tenantId as string,
      userId: parsedActor.userId
    },
    data: {
      isRead: true,
      readAt: new Date()
    }
  });

  return syncDeviceBadgeCount(parsedActor.tenantId as string, parsedActor.userId);
}

export async function dismissTechnicianNotification(actor: ActorContext, notificationId: string) {
  const parsedActor = parseActor(actor);
  if (parsedActor.role !== "technician") {
    throw new Error("Only technicians can update technician notifications.");
  }

  await prisma.technicianNotification.updateMany({
    where: {
      id: notificationId,
      tenantId: parsedActor.tenantId as string,
      userId: parsedActor.userId
    },
    data: {
      isDismissed: true,
      dismissedAt: new Date()
    }
  });

  return syncDeviceBadgeCount(parsedActor.tenantId as string, parsedActor.userId);
}

export async function registerTechnicianDevice(actor: ActorContext, input: {
  platform: MobileDevicePlatform;
  token: string;
  deviceName?: string | null;
  appBuild?: string | null;
  nativeAppVersion?: string | null;
}) {
  const parsedActor = parseActor(actor);
  if (parsedActor.role !== "technician") {
    throw new Error("Only technicians can register a mobile device.");
  }

  await prisma.technicianDeviceRegistration.upsert({
    where: {
      platform_token: {
        platform: input.platform,
        token: input.token
      }
    },
    update: {
      tenantId: parsedActor.tenantId as string,
      userId: parsedActor.userId,
      deviceName: input.deviceName ?? null,
      appBuild: input.appBuild ?? null,
      nativeAppVersion: input.nativeAppVersion ?? null,
      isActive: true,
      lastSeenAt: new Date()
    },
    create: {
      tenantId: parsedActor.tenantId as string,
      userId: parsedActor.userId,
      platform: input.platform,
      token: input.token,
      deviceName: input.deviceName ?? null,
      appBuild: input.appBuild ?? null,
      nativeAppVersion: input.nativeAppVersion ?? null,
      isActive: true
    }
  });

  return syncDeviceBadgeCount(parsedActor.tenantId as string, parsedActor.userId);
}
