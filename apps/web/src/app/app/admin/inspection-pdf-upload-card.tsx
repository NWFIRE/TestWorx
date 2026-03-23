"use client";

import { useActionState } from "react";

const initialState = { error: null as string | null, success: null as string | null };

export function InspectionPdfUploadCard({
  inspectionId,
  attachments,
  action
}: {
  inspectionId: string;
  attachments: Array<{ id: string; fileName: string; source: "uploaded" | "generated"; customerVisible: boolean; createdAt: Date }>;
  action: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className="space-y-5 rounded-[2rem] bg-white p-6 shadow-panel">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">PDF delivery</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Inspection attachments</h3>
        <p className="mt-2 text-sm text-slate-500">Upload customer-ready PDFs and keep generated report packets alongside inspection records.</p>
      </div>
      <form action={formAction} className="space-y-4 rounded-[1.5rem] border border-slate-200 p-4">
        <input name="inspectionId" type="hidden" value={inspectionId} />
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="attachment">Upload PDF</label>
          <input accept="application/pdf" className="block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" id="attachment" name="attachment" type="file" />
        </div>
        <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <input className="h-5 w-5 rounded border-slate-300" defaultChecked name="customerVisible" type="checkbox" />
          Make this PDF visible in the customer portal
        </label>
        {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-emerald-600">{state.success}</p> : null}
        <button className="w-full rounded-2xl bg-slateblue px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "Uploading PDF..." : "Upload PDF"}
        </button>
      </form>
      <div className="space-y-3">
        {attachments.length === 0 ? (
          <p className="rounded-[1.5rem] border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No PDFs attached yet.</p>
        ) : (
          attachments.map((attachment) => (
            <div key={attachment.id} className="flex flex-col gap-3 rounded-[1.5rem] border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-ink">{attachment.fileName}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {attachment.source === "generated" ? "Generated report packet" : "Uploaded attachment"} • {attachment.customerVisible ? "Visible to customer" : "Internal only"}
                </p>
              </div>
              <a className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={`/api/attachments/${attachment.id}`}>
                Download PDF
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}