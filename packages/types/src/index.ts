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

export const inspectionTypes = {
  fire_extinguisher: "fire_extinguisher",
  fire_alarm: "fire_alarm",
  wet_fire_sprinkler: "wet_fire_sprinkler",
  joint_commission_fire_sprinkler: "joint_commission_fire_sprinkler",
  work_order: "work_order",
  backflow: "backflow",
  fire_pump: "fire_pump",
  dry_fire_sprinkler: "dry_fire_sprinkler",
  kitchen_suppression: "kitchen_suppression",
  industrial_suppression: "industrial_suppression",
  emergency_exit_lighting: "emergency_exit_lighting"
} as const;

export type InspectionType = (typeof inspectionTypes)[keyof typeof inspectionTypes];

export const reportStatuses = {
  draft: "draft",
  submitted: "submitted",
  finalized: "finalized"
} as const;

export type ReportStatus = (typeof reportStatuses)[keyof typeof reportStatuses];

