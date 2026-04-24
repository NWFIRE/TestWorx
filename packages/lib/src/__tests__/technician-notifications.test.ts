import { TechnicianNotificationRelatedEntityType, TechnicianNotificationType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { buildTechnicianNotificationHref, splitTechnicianUnreadCounts } from "../technician-notifications";

describe("technician notifications", () => {
  it("routes report notifications into the technician report workflow", () => {
    expect(buildTechnicianNotificationHref({
      id: "notif_1",
      relatedEntityType: TechnicianNotificationRelatedEntityType.report,
      relatedEntityId: "report_1",
      metadata: {
        inspectionId: "inspection_1",
        taskId: "task_1"
      }
    })).toBe("/app/tech/reports/inspection_1/task_1?notification=notif_1");
  });

  it("splits unread counts between work and inspection badges", () => {
    expect(splitTechnicianUnreadCounts([
      { type: TechnicianNotificationType.priority_inspection_assigned, isRead: false },
      { type: TechnicianNotificationType.inspection_reissued_for_correction, isRead: false },
      { type: TechnicianNotificationType.work_order_reassigned, isRead: true }
    ])).toEqual({
      total: 2,
      work: 1,
      inspections: 1
    });
  });
});
