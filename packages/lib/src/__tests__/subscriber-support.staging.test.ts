import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@testworx/db";
import { createSupportTicket, getSupportTicket, updateSupportTicket, requireSupportOperator } from "../subscriber-support";
import { retryTicketReportDelivery } from "../report-delivery";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const staging = process.env.APP_ENV === "staging" && process.env.DATABASE_URL === "postgresql://perf@127.0.0.1:55439/tradeworx_subscriber";
describe.skipIf(!staging)("subscriber support real database", () => {
  const tickets: string[] = [];
  afterAll(async () => { await prisma.supportTicket.deleteMany({ where: { id: { in: tickets } } }); await prisma.$disconnect(); });
  it("enforces tenant ownership, private notes, active membership and one confirmed delivery", async () => {
    const fixture = JSON.parse(readFileSync(resolve(__dirname,"../../../../scripts/staging/results/fixtures.json"),"utf8"));
    const [a,b] = fixture.companies;
    const operator = await prisma.user.findFirstOrThrow({where:{role:"platform_admin",isActive:true}});
    const ticket = await createSupportTicket(a.techId, { title: "Customer report missing", description: "Customer did not receive the issued report.", blocked: true, pagePath: "/app/tech?token=secret", reportId: a.reportId });
    tickets.push(ticket.id);
    expect(await getSupportTicket(b.techId,ticket.id)).toBeNull();
    await expect(requireSupportOperator(a.techId)).rejects.toThrow("Access denied");
    await expect(createSupportTicket(a.techId,{title:"Wrong company report",description:"Should never expose this report.",blocked:false,pagePath:"/app/tech",reportId:b.reportId})).rejects.toThrow("not accessible");
    await updateSupportTicket(operator.id,ticket.id,{action:"note",body:"Internal operator investigation"});
    await updateSupportTicket(operator.id,ticket.id,{action:"reply",body:"We are checking your delivery."});
    const visible = await getSupportTicket(a.techId,ticket.id);
    expect(visible?.messages).toHaveLength(1);
    expect(visible?.pagePath).toBe("/app/tech");
    const before = await prisma.inspectionReport.findUniqueOrThrow({where:{id:a.reportId}});
    await prisma.reportDelivery.update({where:{id:a.deliveryId},data:{status:"failed",failureCode:"email_configuration"}});
    await Promise.allSettled([retryTicketReportDelivery(operator.id,ticket.id,a.deliveryId),retryTicketReportDelivery(operator.id,ticket.id,a.deliveryId)]);
    expect(await prisma.capturedEmail.count({where:{dedupeKey:`report-delivery-${a.deliveryId}`}})).toBe(1);
    expect((await prisma.reportDelivery.findUniqueOrThrow({where:{id:a.deliveryId}})).status).toBe("sent");
    await expect(retryTicketReportDelivery(operator.id,ticket.id,a.deliveryId)).rejects.toThrow("confirmed failed");
    expect(await prisma.inspectionReport.findUniqueOrThrow({where:{id:a.reportId}})).toEqual(before);
    await updateSupportTicket(operator.id,ticket.id,{action:"resolve"});
    await updateSupportTicket(a.techId,ticket.id,{action:"reopen"});
    expect((await getSupportTicket(a.techId,ticket.id))?.status).toBe("open");
    await prisma.user.update({where:{id:a.techId},data:{isActive:false}});
    try { await expect(getSupportTicket(a.techId,ticket.id)).rejects.toThrow("Access denied"); }
    finally { await prisma.user.update({where:{id:a.techId},data:{isActive:true}}); }
  }, 60000);
});
