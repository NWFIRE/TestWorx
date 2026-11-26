import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@testworx/db";
import { listDeliveryDiagnostics, createSupportTicket } from "../subscriber-support";
import { retryTicketReportDelivery } from "../report-delivery";
import { bindCompletedTaskSchedule } from "../recurring-schedule-backfill";
import { getAuthorizedAttachmentDownload } from "../report-service";

const staging = process.env.APP_ENV === "staging" && process.env.EMAIL_DRIVER === "capture" && process.env.DATABASE_URL === "postgresql://perf@127.0.0.1:55439/tradeworx_subscriber";
describe.skipIf(!staging)("operator diagnostics and file/recurrence boundaries", () => {
  afterAll(async () => { await prisma.$disconnect(); });
  it("finds uncertain and interrupted sends without allowing retries or mutating issued records", async () => {
    const [a,b] = JSON.parse(readFileSync(resolve(__dirname,"../../../../scripts/staging/results/fixtures.json"),"utf8")).companies;
    const operator = await prisma.user.findFirstOrThrow({where:{role:"platform_admin",isActive:true}});
    const before = await prisma.reportDelivery.findUniqueOrThrow({where:{id:a.deliveryId}});
    const report = await prisma.inspectionReport.findUniqueOrThrow({where:{id:a.reportId}});
    const attachment = await prisma.attachment.findUniqueOrThrow({where:{id:a.attachmentId}});
    const mailCount = await prisma.capturedEmail.count();
    const ticket = await createSupportTicket(a.techId, { title:"Uncertain delivery review", description:"Provider outcome requires operator review before retry.", blocked:false, pagePath:"/app/tech", reportId:a.reportId });
    try {
      for (const status of ["uncertain", "sending"]) {
        await prisma.reportDelivery.update({where:{id:a.deliveryId},data:{status, attemptedAt:new Date(Date.now()-600000)}});
        expect((await listDeliveryDiagnostics(operator.id,a.deliveryId)).map(row=>row.id)).toContain(a.deliveryId);
        await expect(retryTicketReportDelivery(operator.id,ticket.id,a.deliveryId)).rejects.toThrow(/confirmed failed/);
      }
      await expect(listDeliveryDiagnostics(a.techId)).rejects.toThrow(/Access denied/);
      await expect(listDeliveryDiagnostics(b.techId)).rejects.toThrow(/Access denied/);
      expect(await prisma.capturedEmail.count()).toBe(mailCount);
      expect(await prisma.inspectionReport.findUniqueOrThrow({where:{id:a.reportId}})).toEqual(report);
      expect(await prisma.attachment.findUniqueOrThrow({where:{id:a.attachmentId}})).toEqual(attachment);
      const foreignActor = { userId:b.techId, tenantId:b.tenantId, role:"technician" };
      await expect(getAuthorizedAttachmentDownload(foreignActor,a.attachmentId)).rejects.toThrow();
      const scheduleCount = await prisma.serviceSchedule.count();
      expect(await bindCompletedTaskSchedule(b.tenantId,report.inspectionTaskId)).toBe(false);
      expect(await prisma.serviceSchedule.count()).toBe(scheduleCount);
    } finally {
      await prisma.reportDelivery.update({where:{id:before.id}, data:{status:before.status,attemptedAt:before.attemptedAt}});
      await prisma.supportTicket.delete({where:{id:ticket.id}});
    }
  },30000);
});
