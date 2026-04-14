"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ActionButton } from "@/app/action-button";
import { LiveUrlSearchInput } from "@/app/live-url-search-input";
import { LiveUrlSelectFilter } from "@/app/live-url-select-filter";
import { useToast } from "@/app/toast-provider";
import {
  EmptyState,
  FilterBar,
  KPIStatCard,
  SectionCard,
  StatusBadge,
  WorkspaceSplit
} from "../operations-ui";

type WorkspaceData = {
  tenantName: string;
  branding: {
    legalBusinessName: string;
    phone: string;
    email: string;
    website: string;
    logoDataUrl: string;
    primaryColor: string;
    accentColor: string;
  };
  filters: {
    query: string;
    dueMonth: string;
    hasValidEmail: "all" | "yes" | "no";
    inspectionType: string;
    division: string;
  };
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  templates: Array<{
    key: string;
    label: string;
    subject: string;
    body: string;
    category: "reminder" | "welcome";
    previewEyebrow: string;
    previewTitle: string;
    previewFooter?: string;
    sendSuccessLabel: string;
  }>;
  options: {
    dueMonths: Array<{ value: string; label: string }>;
    inspectionTypes: Array<{ value: string; label: string }>;
    divisions: Array<{ value: string; label: string }>;
  };
  summary: {
    candidateCount: number;
    withValidEmail: number;
    sentRecently: number;
  };
  recipients: Array<{
    customerCompanyId: string;
    customerName: string;
    recipientEmail: string | null;
    hasValidEmail: boolean;
    dueMonth: string;
    siteSummary: string;
    siteNames: string[];
    inspectionTypes: string[];
    inspectionTypeLabels: string[];
    divisions: string[];
    lastSentAt: Date | string | null;
    taskCount: number;
  }>;
  recentHistory: Array<{
    id: string;
    customerName: string;
    recipientEmail: string;
    subjectSnapshot: string;
    templateKey: string;
    templateLabel: string;
    sentAt: Date | string;
    sentByName: string;
    dueMonth: string | null;
    providerReason: string | null;
    providerError: string | null;
  }>;
};

function mergePreviewTemplate(
  template: string,
  fields: Record<"customerName" | "companyName" | "companyPhone" | "companyEmail", string>
) {
  return template
    .replace(/{{\s*(customerName|companyName|companyPhone|companyEmail)\s*}}/g, (_, key) => fields[key as keyof typeof fields] ?? "")
    .replace(/Hello\s+,/g, "Hello,")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "Not sent yet";
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Not sent yet";
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function toPreviewParagraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function EmailRemindersWorkspace({
  data,
  initialCustomerCompanyIds = [],
  initialTemplateKey,
  sendAction
}: {
  data: WorkspaceData;
  initialCustomerCompanyIds?: string[];
  initialTemplateKey?: string;
  sendAction: (input: {
    dueMonth: string;
    customerCompanyIds: string[];
    templateKey: string;
    subject: string;
    body: string;
  }) => Promise<{
    ok: boolean;
    error: string | null;
    message: string | null;
    summary: { templateLabel: string; sentCount: number; failedCount: number; totalCount: number } | null;
  }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const defaultTemplate = data.templates.find((template) => template.key === initialTemplateKey) ?? data.templates[0];
  const [templateKey, setTemplateKey] = useState(defaultTemplate?.key ?? "");
  const [subject, setSubject] = useState(defaultTemplate?.subject ?? "");
  const [body, setBody] = useState(defaultTemplate?.body ?? "");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>(
    initialCustomerCompanyIds.filter((customerCompanyId) =>
      data.recipients.some((recipient) => recipient.customerCompanyId === customerCompanyId)
    )
  );

  const selectedRecipients = useMemo(
    () => data.recipients.filter((recipient) => selectedCustomerIds.includes(recipient.customerCompanyId)),
    [data.recipients, selectedCustomerIds]
  );
  const activeTemplate = useMemo(
    () => data.templates.find((template) => template.key === templateKey) ?? defaultTemplate,
    [data.templates, defaultTemplate, templateKey]
  );
  const sampleRecipient = selectedRecipients[0] ?? data.recipients[0] ?? null;
  const previewFields = useMemo(
    () => ({
      customerName: sampleRecipient?.customerName ?? "",
      companyName: data.branding.legalBusinessName || data.tenantName,
      companyPhone: data.branding.phone || "",
      companyEmail: data.branding.email || ""
    }),
    [data.branding.email, data.branding.legalBusinessName, data.branding.phone, data.tenantName, sampleRecipient]
  );
  const previewSubject = useMemo(() => mergePreviewTemplate(subject, previewFields), [previewFields, subject]);
  const previewBody = useMemo(() => mergePreviewTemplate(body, previewFields), [body, previewFields]);
  const previewTitle = useMemo(
    () => mergePreviewTemplate(activeTemplate?.previewTitle ?? "", previewFields),
    [activeTemplate, previewFields]
  );
  const allVisibleSelected = data.recipients.length > 0 && data.recipients.every((recipient) => selectedCustomerIds.includes(recipient.customerCompanyId));

  function navigateToPage(nextPage: number) {
    const nextSearch = new URLSearchParams(searchParams.toString());
    nextSearch.set("page", String(nextPage));
    router.replace(`${pathname}?${nextSearch.toString()}`, { scroll: false });
  }

  return (
    <>
      <section className="grid gap-3 md:grid-cols-3">
        <KPIStatCard
          label="Candidates"
          note="Customers available in the current communications view."
          tone="blue"
          value={data.summary.candidateCount}
        />
        <KPIStatCard
          label="Ready To Send"
          note="Recipients that already have a valid billing email on file."
          tone="emerald"
          value={data.summary.withValidEmail}
        />
        <KPIStatCard
          label="Recent Outreach"
          note="Customers in this view that already received a recent customer email."
          tone="slate"
          value={data.summary.sentRecently}
        />
      </section>

      <FilterBar
        description="Search customers, refine the current list, and prepare a branded email without leaving the workspace."
        title="Recipient filters"
      >
        <LiveUrlSearchInput
          className="min-w-[18rem] flex-1"
          initialValue={data.filters.query}
          paramKey="query"
          placeholder="Search customer, site, or email"
          resetPageKeys={["page"]}
        />
        <LiveUrlSelectFilter
          options={data.options.dueMonths}
          paramKey="dueMonth"
          resetPageKeys={["page"]}
          value={data.filters.dueMonth}
        />
        <LiveUrlSelectFilter
          options={[
            { value: "all", label: "All email states" },
            { value: "yes", label: "Has valid email" },
            { value: "no", label: "Missing email" }
          ]}
          paramKey="hasValidEmail"
          resetPageKeys={["page"]}
          value={data.filters.hasValidEmail}
        />
        <LiveUrlSelectFilter
          options={data.options.inspectionTypes}
          paramKey="inspectionType"
          resetPageKeys={["page"]}
          value={data.filters.inspectionType}
        />
        <LiveUrlSelectFilter
          options={data.options.divisions}
          paramKey="division"
          resetPageKeys={["page"]}
          value={data.filters.division}
        />
      </FilterBar>

      <WorkspaceSplit variant="content-heavy">
        <SectionCard className="space-y-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Recipients</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Customer list</h2>
              <p className="mt-2 text-sm text-slate-500">
                Select one or more customers, review the shared draft, and send polished customer emails manually.
              </p>
            </div>
            {data.recipients.length > 0 ? (
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  checked={allVisibleSelected}
                  onChange={(event) =>
                    setSelectedCustomerIds(event.target.checked ? data.recipients.map((recipient) => recipient.customerCompanyId) : [])
                  }
                  type="checkbox"
                />
                Select visible recipients
              </label>
            ) : null}
          </div>

          {data.recipients.length === 0 ? (
            <EmptyState
              description="No customers matched the current filters. Try another month or widen the search."
              title="No recipients found"
            />
          ) : (
            <>
              <div className="overflow-hidden rounded-[24px] border border-slate-200/80">
                <div className="hidden grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 md:grid">
                  <span>Select</span>
                  <span>Customer</span>
                  <span>Site context</span>
                  <span>Service lines</span>
                  <span>Status</span>
                </div>
                <div className="divide-y divide-slate-200">
                  {data.recipients.map((recipient) => {
                    const selected = selectedCustomerIds.includes(recipient.customerCompanyId);

                    return (
                      <label
                        className={`grid gap-4 px-4 py-4 transition md:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] ${
                          selected ? "bg-[var(--tenant-primary-soft)]" : "bg-white hover:bg-slate-50"
                        }`}
                        key={recipient.customerCompanyId}
                      >
                        <div className="flex items-start pt-1">
                          <input
                            checked={selected}
                            onChange={(event) =>
                              setSelectedCustomerIds((current) =>
                                event.target.checked
                                  ? [...new Set([...current, recipient.customerCompanyId])]
                                  : current.filter((id) => id !== recipient.customerCompanyId)
                              )
                            }
                            type="checkbox"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">{recipient.customerName}</p>
                          <p className="mt-1 truncate text-sm text-slate-500">{recipient.recipientEmail ?? "No billing email on file"}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {recipient.taskCount > 0
                              ? `${recipient.taskCount} due service line${recipient.taskCount === 1 ? "" : "s"}`
                              : "No due service lines in this month view"}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-700">{recipient.siteSummary}</p>
                          <p className="mt-1 text-xs text-slate-400">{recipient.dueMonth}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-700">{recipient.inspectionTypeLabels.join(", ")}</p>
                          <p className="mt-1 truncate text-xs text-slate-400">{recipient.divisions.join(", ")}</p>
                        </div>
                        <div className="flex min-w-[8rem] flex-col items-start gap-2">
                          <StatusBadge
                            label={recipient.hasValidEmail ? "Ready" : "Missing email"}
                            tone={recipient.hasValidEmail ? "emerald" : "amber"}
                          />
                          <p className="text-xs text-slate-400">Last sent: {formatDateTime(recipient.lastSentAt)}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
              {data.pagination.totalPages > 1 ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-500">
                    Page {data.pagination.page} of {data.pagination.totalPages}
                  </p>
                  <div className="flex gap-3">
                    <button
                      className="pressable inline-flex min-h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={data.pagination.page <= 1}
                      onClick={() => navigateToPage(data.pagination.page - 1)}
                      type="button"
                    >
                      Previous
                    </button>
                    <button
                      className="pressable inline-flex min-h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={data.pagination.page >= data.pagination.totalPages}
                      onClick={() => navigateToPage(data.pagination.page + 1)}
                      type="button"
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </SectionCard>

        <div className="space-y-6">
          <SectionCard className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Compose</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Customer email draft</h2>
              <p className="mt-2 text-sm text-slate-500">
                One shared draft is merged individually per selected customer at send time.
              </p>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Template</span>
              <select
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                onChange={(event) => {
                  const nextTemplate = data.templates.find((template) => template.key === event.target.value);
                  setTemplateKey(event.target.value);
                  if (nextTemplate) {
                    setSubject(nextTemplate.subject);
                    setBody(nextTemplate.body);
                  }
                }}
                value={templateKey}
              >
                {data.templates.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Subject</span>
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                onChange={(event) => setSubject(event.target.value)}
                value={subject}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Body</span>
              <textarea
                className="min-h-[320px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900"
                onChange={(event) => setBody(event.target.value)}
                value={body}
              />
            </label>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">{selectedRecipients.length} recipient{selectedRecipients.length === 1 ? "" : "s"} selected</p>
              <p className="mt-2">
                The preview uses {sampleRecipient ? sampleRecipient.customerName : "the current template"} as a sample merge target.
              </p>
            </div>

            <ActionButton
              className="w-full"
              pending={pending}
              pendingLabel={`Sending ${activeTemplate?.sendSuccessLabel ?? "emails"}...`}
              tone="primary"
              onClick={() => {
                if (selectedRecipients.length === 0) {
                  showToast({ title: "Select at least one recipient.", tone: "error" });
                  return;
                }

                startTransition(async () => {
                  const result = await sendAction({
                    dueMonth: data.filters.dueMonth,
                    customerCompanyIds: selectedRecipients.map((recipient) => recipient.customerCompanyId),
                    templateKey,
                    subject,
                    body
                  });

                  if (result.ok) {
                    showToast({ title: result.message ?? "Customer emails sent", tone: "success" });
                    setSelectedCustomerIds([]);
                    router.refresh();
                    return;
                  }

                  showToast({ title: result.error ?? "Unable to send customer emails.", tone: "error" });
                });
              }}
              type="button"
            >
              {activeTemplate ? `Send ${activeTemplate.sendSuccessLabel}${selectedRecipients.length === 1 ? "" : "s"}` : "Send customer emails"}
            </ActionButton>
          </SectionCard>

          <SectionCard className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Preview</p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Branded email preview</h3>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-[#f3f6fb] p-4">
              <div className="mx-auto max-w-[40rem] overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                <div
                  className="px-6 py-5 text-white"
                  style={{ background: `linear-gradient(135deg, ${data.branding.primaryColor}, ${data.branding.accentColor})` }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      {data.branding.logoDataUrl ? (
                        <Image
                          alt={data.branding.legalBusinessName || data.tenantName}
                          className="max-h-10 w-auto object-contain"
                          height={40}
                          src={data.branding.logoDataUrl}
                          unoptimized
                          width={160}
                        />
                      ) : null}
                    </div>
                    <div className="text-right text-sm font-semibold opacity-95">
                      {data.branding.legalBusinessName || data.tenantName}
                    </div>
                  </div>
                  <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] opacity-80">
                    {activeTemplate?.previewEyebrow ?? "Customer email"}
                  </p>
                  <h4 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{previewTitle || "Customer email"}</h4>
                </div>
                <div className="space-y-4 px-6 py-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Subject</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{previewSubject || "Add a subject"}</p>
                  </div>
                  <div className="space-y-4 text-sm leading-7 text-slate-600">
                    {toPreviewParagraphs(previewBody).map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                  <div className="border-t border-slate-200 pt-4 text-xs leading-6 text-slate-500">
                    <p className="font-semibold text-slate-900">{data.branding.legalBusinessName || data.tenantName}</p>
                    <p>{[data.branding.phone, data.branding.email, data.branding.website].filter(Boolean).join(" • ")}</p>
                  </div>
                  {activeTemplate?.previewFooter ? <p className="text-xs leading-6 text-slate-500">{activeTemplate.previewFooter}</p> : null}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Recent activity</p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Latest sends</h3>
            </div>

            {data.recentHistory.length === 0 ? (
              <EmptyState
                description="Customer email activity will start appearing here once the first batch goes out."
                title="No customer email history yet"
              />
            ) : (
              <div className="space-y-3">
                {data.recentHistory.map((entry) => (
                  <div key={entry.id} className="rounded-[20px] border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{entry.customerName}</p>
                        <p className="mt-1 text-sm text-slate-500">{entry.recipientEmail}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {entry.templateLabel}{entry.dueMonth ? ` - due month ${entry.dueMonth}` : ""} - Sent by {entry.sentByName}
                        </p>
                      </div>
                      <StatusBadge
                        label={entry.providerReason === "sent" ? "Sent" : "Attention"}
                        tone={entry.providerReason === "sent" ? "emerald" : "amber"}
                      />
                    </div>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{formatDateTime(entry.sentAt)}</p>
                    <p className="mt-2 text-sm text-slate-600">{entry.subjectSnapshot}</p>
                    {entry.providerError ? <p className="mt-2 text-sm text-amber-700">{entry.providerError}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </WorkspaceSplit>
    </>
  );
}
