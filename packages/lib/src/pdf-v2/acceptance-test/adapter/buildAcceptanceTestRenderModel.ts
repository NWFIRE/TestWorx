import { acceptanceTestDefinitions, acceptanceTestInstallerDefaults } from "../../../acceptance-test-definition";
import { resolveTenantBranding } from "../../../branding";
import { reportDraftSchema } from "../../../report-engine";
import { getCustomerFacingSiteLabel } from "../../../scheduling";
import type { PdfInput } from "../../types";
import { formatDateTime, formatShortDate } from "../../core/formatting/dates";
import { cleanText, joinNonEmpty } from "../../core/formatting/text";

import type { AcceptanceTestRenderModel } from "../types/acceptanceTestRenderModel";

type AcceptanceSourceInput = PdfInput & {
  report: PdfInput["report"] & {
    status?: string | null;
    assignedTo?: string | null;
  };
};

type NormalizedTestResult =
  | {
      complete: true;
      result: "Pass" | "Fail" | "Yes" | "No";
      displayResult: "Pass" | "Fail";
    }
  | {
      complete: false;
      result: "No";
      displayResult: "Fail";
    };

function asInput(rawReport: unknown) {
  return rawReport as AcceptanceSourceInput;
}

function readSection(draft: ReturnType<typeof reportDraftSchema.parse>, sectionId: string) {
  return draft.sections[sectionId]?.fields as Record<string, unknown> | undefined;
}

function normalizeResult(value: unknown): NormalizedTestResult {
  const normalized = cleanText(value)?.toLowerCase();
  if (!normalized) {
    return {
      complete: false,
      result: "No",
      displayResult: "Fail"
    };
  }

  if (normalized === "yes" || normalized === "pass") {
    return {
      complete: true,
      result: normalized === "yes" ? "Yes" : "Pass",
      displayResult: "Pass"
    };
  }

  return {
    complete: true,
    result: normalized === "no" ? "No" : "Fail",
    displayResult: "Fail"
  };
}

function resolveWorkflowStatus(input: AcceptanceSourceInput, failed: number, incomplete: number): AcceptanceTestRenderModel["report"]["status"] {
  if (input.report.finalizedAt) {
    return "Finalized";
  }

  if (input.report.status === "submitted" || input.report.status === "in_progress" || failed > 0 || incomplete > 0) {
    return "In Progress";
  }

  if (input.report.assignedTo) {
    return "Assigned";
  }

  return "Draft";
}

function buildNarrative(result: AcceptanceTestRenderModel["report"]["result"], failed: number, incomplete: number) {
  if (result === "Pass") {
    return "All required acceptance tests completed successfully.";
  }

  if (result === "Partial") {
    return "Acceptance testing partially completed; follow-up required.";
  }

  if (failed > 0) {
    return "Acceptance testing completed with failed items requiring correction.";
  }

  if (incomplete > 0) {
    return "Acceptance testing is still in progress and follow-up is required before final acceptance.";
  }

  return "Acceptance testing completed with failed items requiring correction.";
}

function cleanSiteAddress(input: AcceptanceSourceInput) {
  return joinNonEmpty(
    [
      input.site.addressLine1,
      input.site.addressLine2,
      joinNonEmpty([input.site.city, input.site.state], ", "),
      input.site.postalCode
    ],
    ", "
  );
}

function readLicense(branding: unknown) {
  if (!branding || typeof branding !== "object") {
    return undefined;
  }

  const license = (branding as Record<string, unknown>).licenseNumber;
  return cleanText(license);
}

export function buildAcceptanceTestRenderModel(rawReport: unknown): AcceptanceTestRenderModel {
  const input = asInput(rawReport);
  const draft = reportDraftSchema.parse(input.draft ?? {});
  const propertyFields = readSection(draft, "property-information");
  const installerFields = readSection(draft, "installer-information");
  const systemFields = readSection(draft, "system-information");
  const witnessFields = readSection(draft, "witness-information");
  const commentsFields = readSection(draft, "comments");
  const branding = resolveTenantBranding({
    tenantName: input.tenant.name,
    branding: input.tenant.branding
  });

  const testsWithState = acceptanceTestDefinitions.map((definition) => {
    const normalized = normalizeResult(readSection(draft, "test-results")?.[definition.key]);
    return {
      key: definition.key,
      label: definition.label,
      code: definition.code,
      category: "Acceptance Test",
      ...normalized
    };
  });

  const passed = testsWithState.filter((test) => test.complete && test.displayResult === "Pass").length;
  const failed = testsWithState.filter((test) => test.complete && test.displayResult === "Fail").length;
  const incomplete = acceptanceTestDefinitions.length - passed - failed;
  const overallResult: AcceptanceTestRenderModel["report"]["result"] =
    incomplete > 0 ? "Partial" : failed > 0 ? "Fail" : "Pass";
  const tests = testsWithState.map(({ complete: _complete, ...test }) => test);

  const companyCityStateZip = joinNonEmpty(
    [
      joinNonEmpty([branding.city, branding.state], ", "),
      branding.postalCode
    ],
    " "
  ) ?? acceptanceTestInstallerDefaults.cityState;

  const installerCompanyName = cleanText(installerFields?.installerCompanyName) ?? branding.legalBusinessName ?? acceptanceTestInstallerDefaults.companyName;
  const installerAddress = joinNonEmpty(
    [
      cleanText(installerFields?.installerAddressLine1) ?? cleanText(branding.addressLine1),
      cleanText(installerFields?.installerCityStateZip) ?? companyCityStateZip
    ],
    ", "
  ) ?? companyCityStateZip;

  return {
    report: {
      title: "Wet Chemical System Acceptance Test Report",
      standard: "NFPA 17A",
      result: overallResult,
      completionDate: formatDateTime(input.report.finalizedAt),
      narrative: buildNarrative(overallResult, failed, incomplete),
      reportId: input.report.id,
      assignedTo: cleanText(input.report.assignedTo),
      status: resolveWorkflowStatus(input, failed, incomplete)
    },
    company: {
      name: branding.legalBusinessName || acceptanceTestInstallerDefaults.companyName,
      logoUrl: cleanText((input.tenant.branding as Record<string, unknown> | undefined)?.logoDataUrl),
      addressLine1: cleanText(branding.addressLine1),
      cityStateZip: companyCityStateZip,
      phone: cleanText(branding.phone) ?? acceptanceTestInstallerDefaults.phone,
      email: cleanText(branding.email),
      website: cleanText(branding.website) ?? acceptanceTestInstallerDefaults.website,
      licenseNumber: readLicense(input.tenant.branding) ?? acceptanceTestInstallerDefaults.licenseNumber
    },
    property: {
      buildingName: cleanText(propertyFields?.buildingName) ?? cleanText(getCustomerFacingSiteLabel(input.site.name)),
      address: cleanText(propertyFields?.address) ?? cleanSiteAddress(input),
      buildingOwner: cleanText(propertyFields?.buildingOwner) ?? cleanText(input.customerCompany.name),
      ownerContact: cleanText(propertyFields?.ownerContact) ?? cleanText(input.customerCompany.phone) ?? cleanText(input.customerCompany.billingEmail)
    },
    installer: {
      companyName: installerCompanyName,
      address: installerAddress,
      contactPerson: cleanText(installerFields?.installerContactPerson),
      contactInfo: joinNonEmpty(
        [
          cleanText(installerFields?.installerPhone) ?? cleanText(branding.phone) ?? acceptanceTestInstallerDefaults.phone,
          cleanText(installerFields?.installerEmail) ?? cleanText(branding.email),
          cleanText(installerFields?.installerWebsite) ?? cleanText(branding.website) ?? acceptanceTestInstallerDefaults.website
        ],
        " | "
      ),
      licenseNumber: cleanText(installerFields?.installerLicenseNumber) ?? readLicense(input.tenant.branding) ?? acceptanceTestInstallerDefaults.licenseNumber
    },
    system: {
      hazardDescription: cleanText(systemFields?.hazardDescription),
      manufacturer: cleanText(systemFields?.manufacturer),
      model: cleanText(systemFields?.model),
      dateLeftInService: formatShortDate(systemFields?.dateLeftInService)
    },
    tests,
    summary: {
      total: tests.length,
      passed,
      failed
    },
    witness: {
      witnessedBy: cleanText(witnessFields?.witnessedBy)
    },
    comments: cleanText(commentsFields?.comments),
    signatures: {
      authorizedAgent: input.customerSignature?.imageDataUrl
        ? {
            name: cleanText(input.customerSignature.signerName) ?? "Authorized Agent",
            title: "Authorized Agent",
            signedAt: formatDateTime(input.customerSignature.signedAt),
            imageUrl: input.customerSignature.imageDataUrl
          }
        : undefined,
      installingContractor: input.technicianSignature?.imageDataUrl
        ? {
            name: cleanText(input.technicianSignature.signerName) ?? "Installing Contractor",
            title: "Installing Contractor",
            signedAt: formatDateTime(input.technicianSignature.signedAt),
            imageUrl: input.technicianSignature.imageDataUrl
          }
        : undefined
    }
  };
}
