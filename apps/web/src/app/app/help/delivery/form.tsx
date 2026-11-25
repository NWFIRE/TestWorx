"use client";
import { useActionState } from "react";
import { sendReportAction } from "./actions";
export function SendReportForm({ reportId }: { reportId: string }) {
  const [state, action, pending] = useActionState(sendReportAction, { message: "" });
  return <form action={action} className="space-y-4"><input type="hidden" name="reportId" value={reportId} /><button disabled={pending} className="min-h-11 rounded-xl bg-blue-700 px-5 py-3 text-white">{pending ? "Sending..." : "Send issued report to customer"}</button>{state.message ? <p role="status">{state.message}</p> : null}</form>;
}
