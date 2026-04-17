import type { ReportFieldDefinition, ReportTemplateDefinition } from "./report-config";
import { acceptanceTestDefinitions } from "./acceptance-test-definition";

const acceptanceTestResultFields: ReportFieldDefinition[] = acceptanceTestDefinitions.map((test) => ({
  id: test.key,
  label: test.label,
  description: test.code ? `NFPA 17A ${test.code}` : undefined,
  type: "select",
  optionProvider: "acceptanceTestResultOptions",
  prefill: [{ source: "priorField", sectionId: "test-results", fieldId: test.key }],
  validation: [{ type: "required", message: `Record a result for "${test.label}" before finalizing.` }]
}));

export const acceptanceTestReportTemplate: ReportTemplateDefinition = {
  label: "Wet chemical acceptance test",
  description: "Premium wet chemical system acceptance testing workflow with structured result capture, installer identity, witness tracking, and customer-ready output.",
  defaultRecurrenceFrequency: undefined,
  pdf: {
    subtitle: "Wet Chemical System Acceptance Test Report",
    nfpaReferences: ["NFPA 17A"]
  },
  sections: [
    {
      id: "property-information",
      label: "Property Information",
      description: "Capture the protected property and owner context for this acceptance test.",
      fields: [
        {
          id: "buildingName",
          label: "Building Name",
          type: "text",
          prefill: [
            { source: "priorField", sectionId: "property-information", fieldId: "buildingName" },
            { source: "siteDefault", key: "siteName" }
          ]
        },
        {
          id: "address",
          label: "Address",
          type: "text",
          prefill: [
            { source: "priorField", sectionId: "property-information", fieldId: "address" },
            { source: "siteDefault", key: "siteAddress" }
          ]
        },
        {
          id: "buildingOwner",
          label: "Building Owner",
          type: "text",
          prefill: [
            { source: "priorField", sectionId: "property-information", fieldId: "buildingOwner" },
            { source: "siteDefault", key: "customerName" }
          ]
        },
        {
          id: "ownerContact",
          label: "Owner Contact",
          type: "text",
          placeholder: "Phone, fax, or email for the owner or representative",
          prefill: [{ source: "priorField", sectionId: "property-information", fieldId: "ownerContact" }]
        }
      ]
    },
    {
      id: "installer-information",
      label: "Installer Information",
      description: "Auto-load the installing company identity from the TradeWorx company profile and allow office overrides when needed.",
      fields: [
        {
          id: "installerCompanyName",
          label: "Company Name",
          type: "text",
          prefill: [
            { source: "priorField", sectionId: "installer-information", fieldId: "installerCompanyName" },
            { source: "tenantBranding", key: "legalBusinessName" },
            { source: "reportDefault", value: "Northwest Fire & Safety" }
          ]
        },
        {
          id: "installerAddressLine1",
          label: "Address",
          type: "text",
          placeholder: "Street address",
          prefill: [
            { source: "priorField", sectionId: "installer-information", fieldId: "installerAddressLine1" },
            { source: "tenantBranding", key: "addressLine1" }
          ]
        },
        {
          id: "installerCityStateZip",
          label: "City / State / ZIP",
          type: "text",
          placeholder: "City, state, and ZIP",
          prefill: [
            { source: "priorField", sectionId: "installer-information", fieldId: "installerCityStateZip" },
            { source: "tenantBranding", key: "cityStateZip" },
            { source: "reportDefault", value: "Enid, Oklahoma" }
          ]
        },
        {
          id: "installerContactPerson",
          label: "Contact Person",
          type: "text",
          placeholder: "Lead installer, project manager, or office contact",
          prefill: [{ source: "priorField", sectionId: "installer-information", fieldId: "installerContactPerson" }]
        },
        {
          id: "installerPhone",
          label: "Phone",
          type: "text",
          prefill: [
            { source: "priorField", sectionId: "installer-information", fieldId: "installerPhone" },
            { source: "tenantBranding", key: "phone" },
            { source: "reportDefault", value: "(580) 540-3119" }
          ]
        },
        {
          id: "installerEmail",
          label: "Email",
          type: "text",
          placeholder: "service@company.com",
          prefill: [
            { source: "priorField", sectionId: "installer-information", fieldId: "installerEmail" },
            { source: "tenantBranding", key: "email" }
          ]
        },
        {
          id: "installerWebsite",
          label: "Website",
          type: "text",
          prefill: [
            { source: "priorField", sectionId: "installer-information", fieldId: "installerWebsite" },
            { source: "tenantBranding", key: "website" },
            { source: "reportDefault", value: "www.nwfireandsafety.com" }
          ]
        },
        {
          id: "installerLicenseNumber",
          label: "License",
          type: "text",
          prefill: [
            { source: "priorField", sectionId: "installer-information", fieldId: "installerLicenseNumber" },
            { source: "tenantBranding", key: "licenseNumber" },
            { source: "reportDefault", value: "OK #466" }
          ]
        }
      ]
    },
    {
      id: "system-information",
      label: "System Information",
      description: "Capture the core wet chemical system details required for acceptance testing.",
      fields: [
        {
          id: "hazardDescription",
          label: "Description of Hazard Protected",
          type: "text",
          placeholder: "Cooking line, hood, duct, plenum, or protected hazard area",
          prefill: [{ source: "priorField", sectionId: "system-information", fieldId: "hazardDescription" }]
        },
        {
          id: "manufacturer",
          label: "System Manufacturer",
          type: "text",
          placeholder: "Manufacturer name",
          prefill: [{ source: "priorField", sectionId: "system-information", fieldId: "manufacturer" }]
        },
        {
          id: "model",
          label: "System Model",
          type: "text",
          placeholder: "Model or system series",
          prefill: [{ source: "priorField", sectionId: "system-information", fieldId: "model" }]
        },
        {
          id: "dateLeftInService",
          label: "Date System Left In Service",
          type: "date",
          prefill: [{ source: "priorField", sectionId: "system-information", fieldId: "dateLeftInService" }]
        }
      ]
    },
    {
      id: "test-results",
      label: "Acceptance Test Results",
      description: "Record each required NFPA 17A acceptance test with one clean normalized result.",
      fields: [
        ...acceptanceTestResultFields,
        {
          id: "totalTests",
          label: "Total Tests",
          type: "number",
          readOnly: true,
          calculation: {
            key: "countFieldsMatchingValues",
            sourceFieldIds: acceptanceTestDefinitions.map((test) => test.key),
            values: ["pass", "fail", "yes", "no", "na"]
          }
        },
        {
          id: "passedTests",
          label: "Passed",
          type: "number",
          readOnly: true,
          calculation: {
            key: "countFieldsMatchingValues",
            sourceFieldIds: acceptanceTestDefinitions.map((test) => test.key),
            values: ["pass", "yes"]
          }
        },
        {
          id: "failedTests",
          label: "Failed",
          type: "number",
          readOnly: true,
          calculation: {
            key: "countFieldsMatchingValues",
            sourceFieldIds: acceptanceTestDefinitions.map((test) => test.key),
            values: ["fail", "no"]
          }
        }
      ]
    },
    {
      id: "witness-information",
      label: "Witness Information",
      description: "Capture the person who witnessed the acceptance test, if applicable.",
      fields: [
        {
          id: "witnessedBy",
          label: "Test Witnessed By",
          type: "text",
          placeholder: "Owner representative, AHJ, GC, or other witness",
          prefill: [{ source: "priorField", sectionId: "witness-information", fieldId: "witnessedBy" }]
        }
      ]
    },
    {
      id: "comments",
      label: "Additional Comments",
      description: "Document customer-facing acceptance notes, follow-up context, or exceptions.",
      fields: [
        {
          id: "comments",
          label: "Comments",
          type: "text",
          placeholder: "Additional acceptance-test comments",
          prefill: [{ source: "priorField", sectionId: "comments", fieldId: "comments" }]
        }
      ]
    }
  ]
};
