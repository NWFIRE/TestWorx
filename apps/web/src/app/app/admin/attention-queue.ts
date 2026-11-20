export const attentionOptions = [
  { value: "", label: "All inspection queues" },
  { value: "unassigned", label: "Unassigned" },
  { value: "payment", label: "Payment collection on site" },
  { value: "linked", label: "Linked visit updates" }
];

export function normalizeAttention(value?: string) {
  return attentionOptions.some(option => option.value === value) ? value! : "";
}

export function attentionWindowEnd(value: string | undefined, fallback: Date) {
  const parsed = value && /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

type QueueInspection = {
  status: string;
  scheduledStart: Date | string;
  tasks: { dueDate?: Date | string | null; dueMonth?: string | null }[];
  assignedTechnicianNames: string[];
  customerCompany: { paymentTermsCode?: string | null };
  amendments?: { id: string }[];
  replacementAmendments?: { id: string }[];
};

export function isInAttentionWindow(inspection: QueueInspection, end: Date) {
  if (["completed", "invoiced", "cancelled"].includes(inspection.status)) return true;
  const scheduled = new Date(inspection.scheduledStart).getTime();
  const dates = inspection.tasks.flatMap(task => [
    task.dueDate ? new Date(task.dueDate).getTime() : NaN,
    task.dueMonth && /^\d{4}-\d{2}$/.test(task.dueMonth) ? new Date(`${task.dueMonth}-01T00:00:00`).getTime() : NaN
  ]).filter(Number.isFinite);
  const due = dates.length ? Math.max(scheduled, Math.min(...dates)) : scheduled;
  return Number.isFinite(due) && due <= end.getTime();
}

export function filterAttentionQueue<T extends QueueInspection>(rows: T[], queue: string) {
  return rows.filter(row => queue === "unassigned" ? row.assignedTechnicianNames.length === 0
    : queue === "payment" ? row.customerCompany.paymentTermsCode === "due_on_receipt"
    : queue === "linked" ? Boolean(row.amendments?.length || row.replacementAmendments?.length)
    : true);
}
