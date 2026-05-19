import { RecurrenceFrequency } from "@prisma/client";

import type { ReportTemplateDefinition } from "./report-config";

export const workOrderReportTemplate: ReportTemplateDefinition = {
  label: "Work order",
  description: "Customer-ready service work order reporting with work performed, labor hours, parts/equipment, photos, and sign-off.",
  defaultRecurrenceFrequency: RecurrenceFrequency.ONCE,
  pdf: {
    subtitle: "Work Order Report",
    nfpaReferences: ["Field Service Work Order"]
  },
  sections: [
    {
      id: "work-performed",
      label: "Work Performed",
      description: "Capture the work completed on site in a simple customer-ready summary.",
      fields: [
        {
          id: "descriptionOfWork",
          label: "Work Performed",
          type: "text",
          placeholder: "Type what work was performed on site.",
          validation: [{ type: "required", message: "Work performed is required before finalizing." }]
        },
        {
          id: "jobsiteHours",
          label: "Labor Hours",
          type: "select",
          optionProvider: "workOrderJobsiteHours"
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
      id: "work-order-photos",
      label: "Photos",
      description: "Attach jobsite, equipment, parts, repair, or completion photos for office review and the customer packet.",
      fields: [
        {
          id: "photos",
          label: "Work order photos",
          type: "repeater",
          addLabel: "Add photo",
          rowFields: [
            {
              id: "photo",
              label: "Photo",
              type: "photo"
            },
            {
              id: "caption",
              label: "Caption",
              type: "text",
              placeholder: "Optional photo note"
            }
          ]
        }
      ]
    }
  ]
};
