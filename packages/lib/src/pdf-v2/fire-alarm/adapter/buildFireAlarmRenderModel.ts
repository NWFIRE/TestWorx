import { resolveTenantBranding } from "../../../branding";
import { inspectionTypeRegistry } from "../../../report-config";
import { reportDraftSchema } from "../../../report-engine";
import { getCustomerFacingSiteLabel } from "../../../scheduling";
import type { PdfInput } from "../../types";
import { formatDateTime, formatShortDate } from "../../core/formatting/dates";
import { isNullEquivalent } from "../../core/formatting/empty";
import { formatYesNo } from "../../core/formatting/booleans";
import { resolveNotificationApplianceDisplayMode } from "../../core/formatting/indicators";
import { resolveFinalCustomerFacingStatus } from "../../core/formatting/status";
import { cleanText, cleanTitleLikeText, joinNonEmpty } from "../../core/formatting/text";

import type { FireAlarmReportRenderModel } from "../types/fireAlarmRenderModel";

function asInput(rawReport: unknown) {
  return rawReport as PdfInput;
}

function humanize(value: unknown) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return undefined;
  }

  return cleaned
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : part)
    .join(" ");
}

function cleanAddress(input: PdfInput) {
  if (!getCustomerFacingSiteLabel(input.site.name)) {
    return undefined;
  }

  return joinNonEmpty([input.site.addressLine1, input.site.addressLine2, joinNonEmpty([input.site.city, input.site.state], ", "), input.site.postalCode], ", ");
}

function readSection(draft: ReturnType<typeof reportDraftSchema.parse>, sectionId: string) {
  return draft.sections[sectionId]?.fields as Record<string, unknown> | undefined;
}

function readRows(draft: ReturnType<typeof reportDraftSchema.parse>, sectionId: string, fieldId: string) {
  const value = draft.sections[sectionId]?.fields?.[fieldId];
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function deriveResult(systemFields: Record<string, unknown> | undefined, deficiencyCount: number) {
  const systemStatus = cleanText(systemFields?.fireAlarmSystemStatus)?.toLowerCase();
  if (systemStatus && /fail|repair|deficien|partial|attention/.test(systemStatus)) {
    return systemStatus.includes("partial") || systemStatus.includes("attention") ? "Partial" : "Fail";
  }

  return deficiencyCount > 0 ? "Fail" : "Pass";
}

function buildNarrative(result: "Pass" | "Fail" | "Partial", deficiencyCount: number) {
  if (result === "Fail") {
    return deficiencyCount > 0
      ? `${deficiencyCount} deficiency${deficiencyCount === 1 ? "" : "ies"} were recorded during this fire alarm inspection and follow-up service is recommended.`
      : "The inspected fire alarm system did not meet the recorded test criteria and follow-up service is recommended.";
  }

  if (result === "Partial") {
    return "The inspection was completed with mixed results and follow-up review is recommended for the affected system components.";
  }

  return "The inspected fire alarm system met the recorded test criteria for the components documented in this report.";
}

function buildPhotoCaption(index: number) {
  return `Photo ${index + 1}`;
}

export function buildFireAlarmRenderModel(rawReport: unknown): FireAlarmReportRenderModel {
  const input = asInput(rawReport);
  const draft = reportDraftSchema.parse(input.draft ?? {});
  const branding = resolveTenantBranding({ tenantName: input.tenant.name, branding: input.tenant.branding });
  const controlFields = readSection(draft, "control-panel");
  const initiatingFields = readSection(draft, "initiating-devices");
  const notificationFields = readSection(draft, "notification");
  const systemFields = readSection(draft, "system-summary");
  const deficiencyCount = input.deficiencies.length || toNumber(systemFields?.deficiencyCount) || 0;
  const status = resolveFinalCustomerFacingStatus({
    documentStatus: input.report.finalizedAt ? "finalized" : input.inspection.status,
    inspectionStatus: input.inspection.status,
    result: deriveResult(systemFields, deficiencyCount)
  });
  const result = status.result ?? "Pass";
  const scheduledWindow = joinNonEmpty([formatDateTime(input.inspection.scheduledStart), input.inspection.scheduledEnd ? formatDateTime(input.inspection.scheduledEnd) : undefined], " to ");
  const customerFacingSiteName = getCustomerFacingSiteLabel(input.site.name);

  return {
    report: {
      title: "Fire Alarm Inspection and Testing Report",
      reportId: input.report.id,
      inspectionDate: formatShortDate(input.inspection.scheduledStart) ?? "",
      finalizedAt: formatDateTime(input.report.finalizedAt),
      documentStatus: status.documentStatus,
      result,
      completionPercent: input.report.finalizedAt ? 100 : undefined,
      narrative: buildNarrative(result, deficiencyCount)
    },
    company: {
      name: branding.legalBusinessName || input.tenant.name,
      logoUrl: cleanText(branding.logoDataUrl),
      phone: cleanText(branding.phone),
      email: cleanText(branding.email),
      website: cleanText(branding.website),
      address: joinNonEmpty([branding.addressLine1, branding.addressLine2, joinNonEmpty([branding.city, branding.state], ", "), branding.postalCode], ", ")
    },
    compliance: {
      codes: inspectionTypeRegistry.fire_alarm.pdf?.nfpaReferences ?? ["NFPA 72", "NFPA 70"]
    },
    identity: {
      customerName: cleanTitleLikeText(input.customerCompany.name) ?? input.customerCompany.name,
      siteName: cleanTitleLikeText(customerFacingSiteName),
      cleanAddress: cleanAddress(input),
      technicianName: cleanTitleLikeText(input.report.technicianName),
      billingContact: cleanTitleLikeText(input.customerCompany.contactName),
      inspectionDate: formatShortDate(input.inspection.scheduledStart) ?? "",
      completionTimestamp: formatDateTime(input.report.finalizedAt),
      scheduledWindow
    },
    page1Metadata: [
      scheduledWindow ? { label: "Scheduled window", value: scheduledWindow } : null,
      cleanText(input.customerCompany.billingEmail) ? { label: "Billing contact", value: input.customerCompany.billingEmail! } : null,
      cleanAddress(input) ? { label: "Service address", value: cleanAddress(input)! } : null
    ].filter((item): item is { label: string; value: string } => Boolean(item)),
    systemSummary: [
      { label: "Control Panels", value: toNumber(systemFields?.controlPanelsInspected) ?? toNumber(controlFields?.controlPanelsInspected) ?? readRows(draft, "control-panel", "controlPanels").length },
      { label: "Initiating Devices", value: toNumber(systemFields?.initiatingDevicesInspected) ?? toNumber(initiatingFields?.initiatingDevicesInspected) ?? readRows(draft, "initiating-devices", "initiatingDevices").length },
      { label: "Notification Appliances", value: toNumber(systemFields?.notificationAppliancesInspected) ?? toNumber(notificationFields?.notificationAppliancesInspected) ?? readRows(draft, "notification", "notificationAppliances").length },
      { label: "Follow-Up Required", value: formatYesNo(systemFields?.followUpRequired) ?? "No", tone: systemFields?.followUpRequired ? "warning" : "success" }
    ],
    controlPanelSection: {
      result: humanize(draft.sections["control-panel"]?.status),
      inspected: toNumber(controlFields?.controlPanelsInspected) ?? readRows(draft, "control-panel", "controlPanels").length,
      deficiencies: toNumber(controlFields?.controlPanelDeficiencyCount) ?? 0,
      detailFields: [
        ["Line Voltage Status", humanize(controlFields?.lineVoltageStatus)],
        ["AC Power Indicator", formatYesNo(controlFields?.acPowerIndicator)],
        ["Power Supply Condition", humanize(controlFields?.powerSupplyCondition)],
        ["Battery Date Code", cleanText(controlFields?.batteryDateCode)],
        ["Battery Size", humanize(controlFields?.batterySizeOther ?? controlFields?.batterySize)],
        ["Quantity", cleanText(controlFields?.batteryQuantity)],
        ["Battery Charge Level", humanize(controlFields?.batteryChargeLevel)],
        ["Battery Load Test", humanize(controlFields?.batteryLoadTest)],
        ["Central Station Signal Test", humanize(controlFields?.centralStationSignalTest)],
        ["Control Panel Condition", humanize(controlFields?.controlPanelCondition)]
      ]
        .map(([label, value]) => (value ? { label, value } : null))
        .filter((item): item is { label: string; value: string } => Boolean(item)),
      rows: readRows(draft, "control-panel", "controlPanels").map((row) => ({
        location: cleanText(row.location),
        type: cleanTitleLikeText(row.panelName ?? row.model),
        manufacturer: cleanTitleLikeText(row.manufacturer),
        serviceKey: cleanText(row.assetTag ?? row.serialNumber),
        inspectionSummary: [
          joinNonEmpty(["Communication Path", humanize(row.communicationPathType)], ": "),
          joinNonEmpty(["Model", cleanText(row.model)], ": "),
          joinNonEmpty(["Serial", cleanText(row.serialNumber)], ": ")
        ].filter((item): item is string => Boolean(item)),
        notes: cleanText(row.comments ?? row.panelPhoto)
      }))
    },
    initiatingDevicesSection: {
      result: humanize(draft.sections["initiating-devices"]?.status),
      inspected: toNumber(initiatingFields?.initiatingDevicesInspected) ?? readRows(draft, "initiating-devices", "initiatingDevices").length,
      deficiencies: toNumber(initiatingFields?.initiatingDeviceDeficiencyCount) ?? 0,
      rows: readRows(draft, "initiating-devices", "initiatingDevices").map((row) => ({
        location: cleanText(row.location),
        deviceType: cleanTitleLikeText(row.deviceTypeOther ?? row.deviceType) ?? "Device",
        functionalTest: humanize(row.functionalTestResult),
        physicalCondition: humanize(row.physicalCondition),
        manufacturer: cleanTitleLikeText(row.manufacturer),
        notes: joinNonEmpty([cleanText(row.comments), cleanText(row.deficiencyNotes)], " • ")
      }))
    },
    notificationAppliancesSection: {
      result: humanize(draft.sections.notification?.status),
      inspected: toNumber(notificationFields?.notificationAppliancesInspected) ?? readRows(draft, "notification", "notificationAppliances").length,
      deficiencies: toNumber(notificationFields?.notificationDeficiencyCount) ?? 0,
      rows: readRows(draft, "notification", "notificationAppliances").map((row) => {
        const mode = resolveNotificationApplianceDisplayMode(row.applianceTypeCustom ?? row.applianceType);
        return {
          location: cleanText(row.location),
          applianceType: cleanTitleLikeText(row.applianceTypeCustom ?? row.applianceType) ?? "Appliance",
          quantity: toNumber(row.quantityCustom ?? row.quantity),
          audibleOperation: mode.showAudible ? humanize(row.audibleOperation) : undefined,
          visibleOperation: mode.showVisible ? humanize(row.visualOperation) : undefined,
          notes: joinNonEmpty([cleanText(row.comments), cleanText(row.deficiencyNotes)], " • ")
        };
      })
    },
    findings: [cleanText(systemFields?.recommendedRepairs), cleanText(controlFields?.controlPanelComments), cleanText(initiatingFields?.initiatingDeviceNotes), cleanText(notificationFields?.notificationNotes)]
      .filter((item): item is string => Boolean(item)),
    deficiencies: input.deficiencies
      .map((item) => ({
        title: cleanTitleLikeText(item.title),
        description: cleanText(item.description) ?? "Deficiency recorded",
        severity: humanize(item.severity),
        action: cleanText(item.notes)
      })),
    notes: joinNonEmpty([cleanText(draft.overallNotes), cleanText(systemFields?.inspectorNotes)], "\n\n"),
    photos: input.photos
      .filter((photo) => !isNullEquivalent(photo.storageKey))
      .map((photo, index) => ({
        url: photo.storageKey,
        caption: buildPhotoCaption(index)
      })),
    signatures: {
      technician: input.technicianSignature && cleanText(input.technicianSignature.imageDataUrl)
        ? {
            name: cleanTitleLikeText(input.technicianSignature.signerName) ?? "Technician",
            signedAt: formatDateTime(input.technicianSignature.signedAt),
            imageUrl: input.technicianSignature.imageDataUrl
          }
        : undefined,
      customer: input.customerSignature && cleanText(input.customerSignature.imageDataUrl)
        ? {
            name: cleanTitleLikeText(input.customerSignature.signerName) ?? "Customer",
            signedAt: formatDateTime(input.customerSignature.signedAt),
            imageUrl: input.customerSignature.imageDataUrl
          }
        : undefined
    }
  };
}
