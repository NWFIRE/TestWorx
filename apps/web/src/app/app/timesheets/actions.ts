"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { clockInEmployee, clockOutEmployee, correctTimeEntry } from "@testworx/lib/server/index";
import type { ActorContext } from "@testworx/types";

async function getActor(): Promise<ActorContext> {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  return {
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId,
    allowances: session.user.allowances ?? null
  };
}

export async function clockInAction() {
  const actor = await getActor();
  await clockInEmployee(actor);
  revalidatePath("/app/tech/timesheets");
  revalidatePath("/app/admin/timesheets");
}

export async function clockOutAction() {
  const actor = await getActor();
  await clockOutEmployee(actor);
  revalidatePath("/app/tech/timesheets");
  revalidatePath("/app/admin/timesheets");
}

export async function correctTimeEntryAction(formData: FormData) {
  const actor = await getActor();
  await correctTimeEntry(actor, {
    timeEntryId: String(formData.get("timeEntryId") ?? ""),
    clockInAt: String(formData.get("clockInAt") ?? ""),
    clockOutAt: String(formData.get("clockOutAt") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    correctionReason: String(formData.get("correctionReason") ?? "")
  });
  revalidatePath("/app/admin/timesheets");
  revalidatePath("/app/tech/timesheets");
}
