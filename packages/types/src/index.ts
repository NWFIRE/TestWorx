import { z } from "zod";

export const actorContextSchema = z.object({
  userId: z.string().min(1),
  role: z.string().min(1),
  tenantId: z.string().nullable()
});

export type ActorContext = z.infer<typeof actorContextSchema>;

export type CustomerOption = { id: string; name: string };
export type SiteOption = { id: string; name: string; city: string; customerCompanyId: string };
export type TechnicianOption = { id: string; name: string };

export const reportStatuses = {
  draft: "draft",
  submitted: "submitted",
  finalized: "finalized"
} as const;

export type ReportStatus = (typeof reportStatuses)[keyof typeof reportStatuses];

