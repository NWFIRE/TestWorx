import { beforeEach, expect, it, vi } from "vitest";
const tx=vi.hoisted(()=>({$executeRaw:vi.fn(),inspectionTask:{findFirst:vi.fn(),update:vi.fn()},serviceSchedule:{findFirst:vi.fn(),create:vi.fn()}}));
vi.mock("@testworx/db",()=>({prisma:{$transaction:async(fn: (db: typeof tx)=>unknown)=>fn(tx)}}));
import { bindCompletedTaskSchedule } from "../recurring-schedule-backfill";
beforeEach(()=>{vi.clearAllMocks();tx.inspectionTask.findFirst.mockResolvedValue({id:"task",inspectionId:"visit",inspectionType:"kitchen_suppression",inspection:{customerCompanyId:"customer",siteId:"site"},recurrence:{frequency:"SEMI_ANNUAL",seriesId:"series",nextDueAt:new Date("2026-10-01T09:00:00Z")}});tx.serviceSchedule.findFirst.mockResolvedValue(null);tx.serviceSchedule.create.mockResolvedValue({id:"schedule"});});
it("creates and links within the locked transaction",async()=>{
 expect(await bindCompletedTaskSchedule("tenant","task")).toBe(true);
 expect(tx.$executeRaw).toHaveBeenCalled();
 expect(tx.inspectionTask.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({tenantId:"tenant",id:"task",serviceScheduleId:null})}));
 expect(tx.serviceSchedule.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({tenantId:"tenant",customerCompanyId:"customer",siteId:"site"})}));
 expect(tx.inspectionTask.update).toHaveBeenCalledWith({where:{id:"task"},data:{serviceScheduleId:"schedule"}});
});
it("reuses and links an existing series even after its due date advances",async()=>{
 tx.serviceSchedule.findFirst.mockResolvedValue({id:"existing"});
 expect(await bindCompletedTaskSchedule("tenant","task")).toBe(false);
 expect(tx.serviceSchedule.create).not.toHaveBeenCalled();
 expect(tx.inspectionTask.update).toHaveBeenCalledWith({where:{id:"task"},data:{serviceScheduleId:"existing"}});
 expect(tx.serviceSchedule.findFirst.mock.calls[0]?.[0].where.OR[0]).toEqual({tasks:{some:{tenantId:"tenant",recurrence:{is:{seriesId:"series"}}}}});
});
it("a repeat or concurrent backfill becomes a no-op once linked",async()=>{
 tx.inspectionTask.findFirst.mockResolvedValue(null);
 expect(await bindCompletedTaskSchedule("tenant","task")).toBe(false);
 expect(tx.serviceSchedule.create).not.toHaveBeenCalled();expect(tx.inspectionTask.update).not.toHaveBeenCalled();
});
it("does not reuse another system's schedule within the same completed visit",async()=>{
 await bindCompletedTaskSchedule("tenant","task");
 expect(tx.serviceSchedule.findFirst.mock.calls[0]?.[0].where.OR[1].tasks).toEqual({none:{inspectionId:"visit",id:{not:"task"}}});
});
