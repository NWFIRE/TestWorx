import { RecurrenceFrequency } from "@prisma/client";

import type { ReportTemplateDefinition } from "./report-config";

export const workOrderReportTemplate: ReportTemplateDefinition = {
  label: "Work order",
  description: "Customer-ready service work order reporting with work performed, jobsite hours, parts, service entries, and sign-off.",
  defaultRecurrenceFrequency: RecurrenceFrequency.ONCE,
  pdf: {
    subtitle: "Work Order Report",
    nfpaReferences: ["Field Service Work Order"]
  },
  sections: [
    {
      id: "work-performed",
      label: "Work performed",
      description: "Capture the core work narrative, total jobsite time, and any follow-up that should stay visible in the finished service document.",
      fields: [
        {
          id: "workOrderNumber",
          label: "Work order number",
          type: "text",
          placeholder: "Optional office work order reference"
        },
        {
          id: "descriptionOfWork",
          label: "Description of Work",
          type: "text",
          placeholder: "Describe the service work performed on site.",
          validation: [{ type: "required", message: "Description of work is required before finalizing." }]
        },
        {
          id: "jobsiteHours",
          label: "Jobsite Hours",
          type: "select",
          optionProvider: "workOrderJobsiteHours",
          customValueFieldId: "jobsiteHoursCustom",
          customValueTrigger: "other"
        },
        {
          id: "jobsiteHoursCustom",
          label: "Custom Jobsite Hours",
          type: "text",
          placeholder: "Enter custom jobsite hours",
          visibleWhen: { fieldId: "jobsiteHours", values: ["other"] }
        },
        {
          id: "followUpRequired",
          label: "Follow-up Required for this Job",
          type: "boolean"
        },
        {
          id: "additionalNotes",
          label: "Additional Notes",
          type: "text",
          placeholder: "Add any customer-facing notes, site conditions, or service context that should appear on the report."
        }
      ]
    },
    {
      id: "parts-equipment-used",
      label: "Parts / Equipment Used",
      description: "List any new extinguishers, emergency lights, exit signs, or other parts/equipment supplied during the work order visit.",
      fields: [
        {
          id: "partsEquipmentUsed",
          label: "Parts / Equipment Used",
          type: "repeater",
          addLabel: "Add part or equipment",
          rowFields: [
            {
              id: "item",
              label: "Item",
              type: "select",
              optionProvider: "workOrderPartsEquipmentOptions",
              customValueFieldId: "itemCustom",
              customValueTrigger: "other",
              mappings: [
                {
                  source: "optionMetadata",
                  targets: [{ fieldId: "category", sourceKey: "category", mode: "always" }]
                }
              ]
            },
            {
              id: "itemCustom",
              label: "Custom item",
              type: "text",
              placeholder: "Enter custom item",
              visibleWhen: { fieldId: "item", values: ["other"] }
            },
            {
              id: "category",
              label: "Category",
              type: "text",
              hidden: true,
              readOnly: true
            },
            {
              id: "quantity",
              label: "Quantity",
              type: "number",
              placeholder: "1",
              prefill: [{ source: "reportDefault", value: 1 }]
            },
            {
              id: "notes",
              label: "Notes",
              type: "text",
              placeholder: "Optional item-specific note"
            }
          ]
        }
      ]
    },
    {
      id: "service-provided",
      label: "Service provided",
      description: "Track the service work performed, including extinguisher service actions and any applicable equipment type or custom service detail.",
      fields: [
        {
          id: "serviceProvided",
          label: "Service Provided",
          type: "repeater",
          addLabel: "Add service entry",
          rowFields: [
            {
              id: "service",
              label: "Service",
              type: "select",
              optionProvider: "workOrderServiceOptions",
              customValueFieldId: "serviceCustom",
              customValueTrigger: "other"
            },
            {
              id: "serviceCustom",
              label: "Custom service",
              type: "text",
              placeholder: "Enter custom service",
              visibleWhen: { fieldId: "service", values: ["other"] }
            },
            {
              id: "applicableEquipment",
              label: "Applicable Type / Equipment",
              type: "select",
              optionProvider: "workOrderPartsEquipmentOptions",
              customValueFieldId: "applicableEquipmentCustom",
              customValueTrigger: "other"
            },
            {
              id: "applicableEquipmentCustom",
              label: "Custom applicable type / equipment",
              type: "text",
              placeholder: "Enter equipment type",
              visibleWhen: { fieldId: "applicableEquipment", values: ["other"] }
            },
            {
              id: "quantity",
              label: "Quantity",
              type: "number",
              placeholder: "1",
              prefill: [{ source: "reportDefault", value: 1 }]
            },
            {
              id: "notes",
              label: "Notes",
              type: "text",
              placeholder: "Optional service note"
            }
          ]
        }
      ]
    }
  ]
};
