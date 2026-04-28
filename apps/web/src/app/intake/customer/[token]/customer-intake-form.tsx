"use client";

import { useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";

import type { CustomerIntakeSubmission } from "@testworx/lib/server/index";

import { submitCustomerIntakeAction } from "./actions";

type Branding = {
  logoDataUrl: string;
  legalBusinessName: string;
  phone: string;
  email: string;
  website: string;
};

type SystemOption = {
  value: string;
  label: string;
};

type IntakeValues = {
  companyName: string;
  companyWebsite: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  billingContactName: string;
  billingEmail: string;
  billingPhone: string;
  billingAddressLine1: string;
  billingAddressLine2: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  siteName: string;
  siteAddressLine1: string;
  siteAddressLine2: string;
  siteCity: string;
  siteState: string;
  sitePostalCode: string;
  siteContactName: string;
  siteContactPhone: string;
  siteContactEmail: string;
  requestedServiceType: string;
  preferredServiceDate: string;
  preferredTimeWindow: string;
  serviceNotes: string;
};

type FieldName = keyof IntakeValues | "systemTypes" | "confirmation";

const requestedServiceTypes = [
  "Inspection",
  "Repair",
  "Emergency Service",
  "New Installation",
  "Acceptance Test",
  "Other"
];

const initialValues: IntakeValues = {
  companyName: "",
  companyWebsite: "",
  primaryContactName: "",
  primaryContactEmail: "",
  primaryContactPhone: "",
  billingContactName: "",
  billingEmail: "",
  billingPhone: "",
  billingAddressLine1: "",
  billingAddressLine2: "",
  billingCity: "",
  billingState: "",
  billingPostalCode: "",
  siteName: "",
  siteAddressLine1: "",
  siteAddressLine2: "",
  siteCity: "",
  siteState: "",
  sitePostalCode: "",
  siteContactName: "",
  siteContactPhone: "",
  siteContactEmail: "",
  requestedServiceType: "",
  preferredServiceDate: "",
  preferredTimeWindow: "",
  serviceNotes: ""
};

const requiredFields: Array<{ name: keyof IntakeValues; message: string }> = [
  { name: "companyName", message: "Enter your company name." },
  { name: "primaryContactName", message: "Enter the primary contact name." },
  { name: "primaryContactEmail", message: "Enter a valid primary contact email." },
  { name: "primaryContactPhone", message: "Enter the primary contact phone." },
  { name: "billingEmail", message: "Enter a valid billing email." },
  { name: "billingAddressLine1", message: "Enter the billing street address." },
  { name: "billingCity", message: "Enter the billing city." },
  { name: "billingState", message: "Enter the billing state." },
  { name: "billingPostalCode", message: "Enter the billing ZIP code." },
  { name: "siteAddressLine1", message: "Enter the service location street address." },
  { name: "siteCity", message: "Enter the service location city." },
  { name: "siteState", message: "Enter the service location state." },
  { name: "sitePostalCode", message: "Enter the service location ZIP code." },
  { name: "requestedServiceType", message: "Choose the requested service type." }
];

function isEmailField(name: keyof IntakeValues) {
  return name === "primaryContactEmail" || name === "billingEmail" || name === "siteContactEmail";
}

function looksLikeEmail(value: string) {
  return value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isSectionComplete(values: IntakeValues, fields: Array<keyof IntakeValues>, selectedSystems: string[]) {
  return fields.every((field) => values[field].trim().length > 0) && (fields.includes("requestedServiceType") ? selectedSystems.length > 0 : true);
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="min-h-[52px] w-full rounded-2xl bg-[var(--tenant-primary)] px-6 text-base font-semibold text-[var(--tenant-primary-contrast)] shadow-[0_16px_34px_rgb(var(--tenant-primary-rgb)/0.22)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
      disabled={pending}
      type="submit"
    >
      {pending ? "Submitting..." : "Submit customer setup"}
    </button>
  );
}

export function CustomerIntakeForm({
  branding,
  error,
  expirationDate,
  systemOptions,
  token
}: {
  branding: Branding;
  error?: string;
  expirationDate: string;
  systemOptions: SystemOption[];
  token: string;
}) {
  const [values, setValues] = useState<IntakeValues>(initialValues);
  const [selectedSystems, setSelectedSystems] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [sameAsPrimary, setSameAsPrimary] = useState(false);
  const [sameAsBilling, setSameAsBilling] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [fileNames, setFileNames] = useState<string[]>([]);
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>>>({});

  const preferredServiceWindow = [values.preferredServiceDate, values.preferredTimeWindow].filter(Boolean).join(" · ");
  const companyComplete = isSectionComplete(values, ["companyName", "primaryContactName", "primaryContactEmail", "primaryContactPhone"], selectedSystems);
  const billingComplete = isSectionComplete(values, ["billingEmail", "billingAddressLine1", "billingCity", "billingState", "billingPostalCode"], selectedSystems);
  const siteComplete = isSectionComplete(values, ["siteAddressLine1", "siteCity", "siteState", "sitePostalCode"], selectedSystems);
  const requestComplete = isSectionComplete(values, ["requestedServiceType"], selectedSystems);
  const stepStatus = [
    { label: "Company", complete: companyComplete },
    { label: "Billing", complete: billingComplete },
    { label: "Service Location", complete: siteComplete },
    { label: "Service Request", complete: requestComplete },
    { label: "Review", complete: confirmed }
  ];
  const firstIncompleteIndex = stepStatus.findIndex((step) => !step.complete);
  const currentStepIndex = firstIncompleteIndex === -1 ? stepStatus.length - 1 : firstIncompleteIndex;
  const completedCount = stepStatus.filter((step) => step.complete).length;
  const progressPercent = Math.round((completedCount / stepStatus.length) * 100);

  const selectedSystemLabels = selectedSystems.map((value) => systemOptions.find((option) => option.value === value)?.label ?? value);

  function setField(name: keyof IntakeValues, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  }

  function assignRef(name: FieldName) {
    return (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null) => {
      if (element) {
        fieldRefs.current[name] = element;
      }
    };
  }

  function handleSameAsPrimary(checked: boolean) {
    setSameAsPrimary(checked);
    if (checked) {
      setValues((current) => ({
        ...current,
        billingContactName: current.primaryContactName,
        billingEmail: current.primaryContactEmail,
        billingPhone: current.primaryContactPhone
      }));
    }
  }

  function handleSameAsBilling(checked: boolean) {
    setSameAsBilling(checked);
    if (checked) {
      setValues((current) => ({
        ...current,
        siteAddressLine1: current.billingAddressLine1,
        siteAddressLine2: current.billingAddressLine2,
        siteCity: current.billingCity,
        siteState: current.billingState,
        sitePostalCode: current.billingPostalCode
      }));
    }
  }

  function handleSystemType(value: string, checked: boolean) {
    setSelectedSystems((current) => checked ? [...current, value] : current.filter((item) => item !== value));
    setErrors((current) => ({ ...current, systemTypes: undefined }));
  }

  function validate() {
    const nextErrors: Partial<Record<FieldName, string>> = {};
    for (const field of requiredFields) {
      const value = values[field.name].trim();
      if (!value) {
        nextErrors[field.name] = field.message;
      } else if (isEmailField(field.name) && !looksLikeEmail(value)) {
        nextErrors[field.name] = field.message;
      }
    }
    if (values.siteContactEmail && !looksLikeEmail(values.siteContactEmail)) {
      nextErrors.siteContactEmail = "Enter a valid site contact email.";
    }
    if (!selectedSystems.length) {
      nextErrors.systemTypes = "Select at least one system type.";
    }
    if (!confirmed) {
      nextErrors.confirmation = "Confirm the information is accurate before submitting.";
    }
    return nextErrors;
  }

  function focusFirstError(nextErrors: Partial<Record<FieldName, string>>) {
    const firstErrorName = Object.keys(nextErrors)[0] as FieldName | undefined;
    if (!firstErrorName) {
      return;
    }
    const target = fieldRefs.current[firstErrorName];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => target.focus({ preventScroll: true }), 250);
      return;
    }
    document.getElementById(firstErrorName)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      event.preventDefault();
      focusFirstError(nextErrors);
    }
  }

  return (
    <form action={submitCustomerIntakeAction} className="space-y-6" noValidate onSubmit={handleSubmit}>
      <input name="token" type="hidden" value={token} />
      <input name="preferredServiceWindow" type="hidden" value={preferredServiceWindow} />

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-5 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex items-center gap-4">
            {branding.logoDataUrl ? (
              <Image
                alt={branding.legalBusinessName}
                className="h-auto max-h-12 w-auto max-w-40 rounded-2xl bg-white object-contain"
                height={48}
                src={branding.logoDataUrl}
                width={160}
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--tenant-primary-soft)] text-sm font-black text-[var(--tenant-primary)]">
                NW
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-slate-950">{branding.legalBusinessName}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--tenant-primary)]">Secure customer setup</p>
            </div>
          </div>
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
            Secure link · Takes about 2-3 minutes
          </div>
        </div>
        <div className="px-5 py-6 sm:px-7 sm:py-8">
          <h1 className="max-w-2xl text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl">
            Complete your customer setup
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            Provide the information we need to create your account, confirm billing details, and schedule service.
          </p>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-6">
        <div className="sm:hidden">
          <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
            <span>{stepStatus[currentStepIndex]?.label}</span>
            <span>{progressPercent}% complete</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[var(--tenant-primary)] transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        <div className="hidden grid-cols-5 gap-3 sm:grid">
          {stepStatus.map((step, index) => {
            const active = index === currentStepIndex;
            return (
              <div
                className={[
                  "rounded-2xl border px-4 py-3 text-sm transition",
                  step.complete
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : active
                      ? "border-[var(--tenant-primary-border)] bg-[var(--tenant-primary-soft)] text-[var(--tenant-primary)]"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                ].join(" ")}
                key={step.label}
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.18em]">{`Step ${index + 1}`}</p>
                <p className="mt-1 font-semibold">{step.label}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--tenant-primary)]">Before we schedule service</p>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">
          Before we schedule service, we need a few details to set up your customer profile correctly.
        </p>
        <div className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
          {[
            "Create your customer account",
            "Confirm billing details",
            "Verify the service location",
            "Prepare your service request"
          ].map((item) => (
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3" key={item}>
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--tenant-primary)]" />
              <span>{item}</span>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm font-semibold text-slate-500">This secure link expires on {expirationDate}.</p>
      </section>

      <FormSection
        description="Tell us who we'll be setting up as the customer account."
        eyebrow="Section A"
        title="Company information"
      >
        <TextField assignRef={assignRef} error={errors.companyName} label="Company name" name="companyName" required setField={setField} value={values.companyName} />
        <TextField assignRef={assignRef} error={errors.primaryContactName} label="Primary contact name" name="primaryContactName" required setField={setField} value={values.primaryContactName} />
        <TextField assignRef={assignRef} error={errors.primaryContactEmail} label="Primary contact email" name="primaryContactEmail" required setField={setField} type="email" value={values.primaryContactEmail} />
        <TextField assignRef={assignRef} error={errors.primaryContactPhone} label="Primary contact phone" name="primaryContactPhone" required setField={setField} type="tel" value={values.primaryContactPhone} />
        <TextField assignRef={assignRef} label="Company website" name="companyWebsite" placeholder="Optional" setField={setField} value={values.companyWebsite} />
      </FormSection>

      <FormSection
        action={(
          <ToggleCard
            checked={sameAsPrimary}
            label="Same as primary contact"
            name="sameAsPrimary"
            onChange={handleSameAsPrimary}
          />
        )}
        description="Where should invoices and billing communication be sent?"
        eyebrow="Section B"
        title="Billing information"
      >
        <TextField assignRef={assignRef} label="Billing contact name" name="billingContactName" placeholder="Optional" setField={setField} value={values.billingContactName} />
        <TextField assignRef={assignRef} error={errors.billingEmail} label="Billing email" name="billingEmail" required setField={setField} type="email" value={values.billingEmail} />
        <TextField assignRef={assignRef} label="Billing phone" name="billingPhone" placeholder="Optional" setField={setField} type="tel" value={values.billingPhone} />
        <TextField assignRef={assignRef} error={errors.billingAddressLine1} label="Billing address line 1" name="billingAddressLine1" required setField={setField} value={values.billingAddressLine1} />
        <TextField assignRef={assignRef} label="Billing address line 2" name="billingAddressLine2" placeholder="Suite, unit, building" setField={setField} value={values.billingAddressLine2} />
        <TextField assignRef={assignRef} error={errors.billingCity} label="City" name="billingCity" required setField={setField} value={values.billingCity} />
        <TextField assignRef={assignRef} error={errors.billingState} label="State" name="billingState" required setField={setField} value={values.billingState} />
        <TextField assignRef={assignRef} error={errors.billingPostalCode} label="ZIP code" name="billingPostalCode" required setField={setField} value={values.billingPostalCode} />
      </FormSection>

      <FormSection
        action={(
          <ToggleCard
            checked={sameAsBilling}
            label="Service location is the same as billing address"
            name="sameAsBilling"
            onChange={handleSameAsBilling}
          />
        )}
        description="Tell us where service will be performed."
        eyebrow="Section C"
        title="Service location"
      >
        <TextField assignRef={assignRef} label="Site / location name" name="siteName" placeholder="Optional, such as Main Building" setField={setField} value={values.siteName} />
        <TextField assignRef={assignRef} error={errors.siteAddressLine1} label="Service address line 1" name="siteAddressLine1" required setField={setField} value={values.siteAddressLine1} />
        <TextField assignRef={assignRef} label="Service address line 2" name="siteAddressLine2" placeholder="Suite, unit, building" setField={setField} value={values.siteAddressLine2} />
        <TextField assignRef={assignRef} error={errors.siteCity} label="City" name="siteCity" required setField={setField} value={values.siteCity} />
        <TextField assignRef={assignRef} error={errors.siteState} label="State" name="siteState" required setField={setField} value={values.siteState} />
        <TextField assignRef={assignRef} error={errors.sitePostalCode} label="ZIP code" name="sitePostalCode" required setField={setField} value={values.sitePostalCode} />
        <TextField assignRef={assignRef} label="Site contact name" name="siteContactName" placeholder="Optional" setField={setField} value={values.siteContactName} />
        <TextField assignRef={assignRef} label="Site contact phone" name="siteContactPhone" placeholder="Optional" setField={setField} type="tel" value={values.siteContactPhone} />
        <TextField assignRef={assignRef} error={errors.siteContactEmail} label="Site contact email" name="siteContactEmail" placeholder="Optional" setField={setField} type="email" value={values.siteContactEmail} />
      </FormSection>

      <FormSection
        description="Tell us what kind of service you need so we can route the request correctly."
        eyebrow="Section D"
        title="Service request"
      >
        <SelectField
          assignRef={assignRef}
          error={errors.requestedServiceType}
          label="Requested service type"
          name="requestedServiceType"
          options={requestedServiceTypes}
          required
          setField={setField}
          value={values.requestedServiceType}
        />
        <TextField assignRef={assignRef} label="Preferred service date" name="preferredServiceDate" placeholder="Optional" setField={setField} type="date" value={values.preferredServiceDate} />
        <TextField assignRef={assignRef} label="Preferred time window" name="preferredTimeWindow" placeholder="Morning, afternoon, or a specific window" setField={setField} value={values.preferredTimeWindow} />
        <div className="md:col-span-2" id="systemTypes">
          <p className="mb-3 text-sm font-semibold text-slate-800">System type(s) <span className="text-rose-600">*</span></p>
          <div className="grid gap-3 sm:grid-cols-2">
            {systemOptions.map((option) => {
              const selected = selectedSystems.includes(option.value);
              return (
                <label
                  className={[
                    "flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                    selected
                      ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary-soft)] text-[var(--tenant-primary)]"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-[var(--tenant-primary-border)]"
                  ].join(" ")}
                  key={option.value}
                >
                  <input
                    checked={selected}
                    className="h-5 w-5 accent-[var(--tenant-primary)]"
                    name="systemTypes"
                    onChange={(event) => handleSystemType(option.value, event.target.checked)}
                    type="checkbox"
                    value={option.value}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
          {errors.systemTypes ? <p className="mt-2 text-sm font-semibold text-rose-700">{errors.systemTypes}</p> : null}
        </div>
        <label className="block md:col-span-2">
          <span className="mb-2 block text-sm font-semibold text-slate-800">Service notes / description</span>
          <textarea
            className="min-h-32 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[var(--tenant-primary)] focus:ring-4 focus:ring-[color:rgb(var(--tenant-primary-rgb)/0.16)]"
            name="serviceNotes"
            onChange={(event) => setField("serviceNotes", event.target.value)}
            placeholder="Briefly describe what you need help with."
            ref={assignRef("serviceNotes")}
            value={values.serviceNotes}
          />
        </label>
      </FormSection>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--tenant-primary)]">Optional uploads</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Photos or documents</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          You can attach photos, previous reports, or documents if they help us understand the request.
        </p>
        <label className="mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center transition hover:border-[var(--tenant-primary-border)] hover:bg-[var(--tenant-primary-soft)]">
          <span className="text-base font-semibold text-slate-950">Tap to upload files</span>
          <span className="mt-1 text-sm text-slate-500">Photos, PDFs, images, or prior inspection reports</span>
          <input
            accept="image/*,.pdf"
            className="sr-only"
            multiple
            name="uploads"
            onChange={(event) => setFileNames(Array.from(event.target.files ?? []).map((file) => file.name))}
            type="file"
          />
        </label>
        {fileNames.length ? (
          <div className="mt-4 grid gap-2">
            {fileNames.map((fileName) => (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700" key={fileName}>
                {fileName}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--tenant-primary)]">Review</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Review your information</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ReviewItem label="Company" value={values.companyName || "Not entered"} />
          <ReviewItem label="Primary contact" value={values.primaryContactName || "Not entered"} />
          <ReviewItem label="Billing email" value={values.billingEmail || "Not entered"} />
          <ReviewItem label="Service location" value={[values.siteAddressLine1, values.siteCity, values.siteState].filter(Boolean).join(", ") || "Not entered"} />
          <ReviewItem label="Requested service type" value={values.requestedServiceType || "Not selected"} />
          <ReviewItem label="System types" value={selectedSystemLabels.join(", ") || "Not selected"} />
        </div>
        <label
          className={[
            "mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-4 text-sm font-semibold transition",
            confirmed ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"
          ].join(" ")}
        >
          <input
            checked={confirmed}
            className="mt-0.5 h-5 w-5 accent-[var(--tenant-primary)]"
            id="confirmation"
            onChange={(event) => {
              setConfirmed(event.target.checked);
              setErrors((current) => ({ ...current, confirmation: undefined }));
            }}
            ref={assignRef("confirmation")}
            type="checkbox"
          />
          <span>I confirm the information above is accurate.</span>
        </label>
        {errors.confirmation ? <p className="mt-2 text-sm font-semibold text-rose-700">{errors.confirmation}</p> : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-slate-500">
            After you submit, our team will review your setup information and follow up with next steps.
          </p>
          <SubmitButton />
        </div>
      </section>
    </form>
  );
}

function FormSection({
  action,
  children,
  description,
  eyebrow,
  title
}: {
  action?: ReactNode;
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--tenant-primary)]">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
        </div>
        {action}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function TextField({
  assignRef,
  error,
  label,
  name,
  placeholder,
  required,
  setField,
  type = "text",
  value
}: {
  assignRef: (name: FieldName) => (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null) => void;
  error?: string;
  label: string;
  name: keyof IntakeValues;
  placeholder?: string;
  required?: boolean;
  setField: (name: keyof IntakeValues, value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-800">
        {label} {required ? <span className="text-rose-600">*</span> : null}
      </span>
      <input
        className={[
          "min-h-12 w-full rounded-2xl border bg-white px-4 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[var(--tenant-primary)] focus:ring-4 focus:ring-[color:rgb(var(--tenant-primary-rgb)/0.16)]",
          error ? "border-rose-300 bg-rose-50" : "border-slate-200"
        ].join(" ")}
        name={name}
        onChange={(event) => setField(name, event.target.value)}
        placeholder={placeholder}
        ref={assignRef(name)}
        type={type}
        value={value}
      />
      {error ? <p className="mt-2 text-sm font-semibold text-rose-700">{error}</p> : null}
    </label>
  );
}

function SelectField({
  assignRef,
  error,
  label,
  name,
  options,
  required,
  setField,
  value
}: {
  assignRef: (name: FieldName) => (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null) => void;
  error?: string;
  label: string;
  name: keyof IntakeValues;
  options: string[];
  required?: boolean;
  setField: (name: keyof IntakeValues, value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-800">
        {label} {required ? <span className="text-rose-600">*</span> : null}
      </span>
      <select
        className={[
          "min-h-12 w-full rounded-2xl border bg-white px-4 text-base text-slate-950 outline-none transition focus:border-[var(--tenant-primary)] focus:ring-4 focus:ring-[color:rgb(var(--tenant-primary-rgb)/0.16)]",
          error ? "border-rose-300 bg-rose-50" : "border-slate-200"
        ].join(" ")}
        name={name}
        onChange={(event) => setField(name, event.target.value)}
        ref={assignRef(name)}
        value={value}
      >
        <option value="">Choose one</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error ? <p className="mt-2 text-sm font-semibold text-rose-700">{error}</p> : null}
    </label>
  );
}

function ToggleCard({
  checked,
  label,
  name,
  onChange
}: {
  checked: boolean;
  label: string;
  name: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={[
        "flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
        checked ? "border-[var(--tenant-primary-border)] bg-[var(--tenant-primary-soft)] text-[var(--tenant-primary)]" : "border-slate-200 bg-slate-50 text-slate-600"
      ].join(" ")}
    >
      <input
        checked={checked}
        className="h-5 w-5 accent-[var(--tenant-primary)]"
        name={name}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

export function IntakeConfirmation({
  branding,
  submittedData
}: {
  branding: Branding;
  submittedData: CustomerIntakeSubmission | null;
}) {
  const serviceLocation = submittedData
    ? [submittedData.siteAddressLine1, submittedData.siteCity, submittedData.siteState].filter(Boolean).join(", ")
    : "";

  return (
    <section className="rounded-[30px] border border-emerald-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-9">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl font-black text-emerald-700">✓</div>
      <h1 className="mt-6 text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl">
        Thank you — your information was submitted
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
        Our team will review your customer setup information and follow up with next steps.
      </p>
      {submittedData ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <ReviewItem label="Company" value={submittedData.companyName} />
          <ReviewItem label="Service location" value={serviceLocation || "Not entered"} />
          <ReviewItem label="Requested service" value={submittedData.requestedServiceType} />
        </div>
      ) : null}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
        {branding.website ? (
          <a
            className="inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-[var(--tenant-primary)] px-6 text-base font-semibold text-[var(--tenant-primary-contrast)]"
            href={branding.website}
          >
            Return to Northwest Fire & Safety website
          </a>
        ) : null}
        {branding.phone ? (
          <a className="inline-flex min-h-[52px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 text-base font-semibold text-slate-800" href={`tel:${branding.phone}`}>
            Call us at {branding.phone}
          </a>
        ) : null}
      </div>
    </section>
  );
}
