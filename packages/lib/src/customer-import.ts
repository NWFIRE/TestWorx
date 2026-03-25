import { Prisma, prisma } from "@testworx/db";
import { z } from "zod";

import type { ActorContext, InspectionType } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import type { JsonObject, JsonValue } from "./json-types";
import { assertTenantContext } from "./permissions";
import { getTenantQuickBooksConnectionStatus, syncTradeWorxCustomerCompanyToQuickBooks } from "./quickbooks";
import { inspectionTypeRegistry } from "./report-config";

const requiredCustomerSiteHeaders = [
  "customerName",
  "contactName",
  "billingEmail",
  "phone",
  "siteName",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "siteNotes"
] as const;

const optionalAssetHeaders = [
  "assetName",
  "assetTag",
  "assetInspectionTypes",
  "assetLocation",
  "assetManufacturer",
  "assetModel",
  "assetSerialNumber"
] as const;

export const customerSiteImportHeaders = [
  ...requiredCustomerSiteHeaders,
  ...optionalAssetHeaders
] as const;

const headerAliases: Record<string, (typeof customerSiteImportHeaders)[number]> = {
  "Company Name": "customerName",
  "Contact Name": "contactName",
  Email: "billingEmail",
  Phone: "phone",
  Address: "addressLine1",
  Notes: "siteNotes"
};

const minimumImportHeaders = ["customerName", "addressLine1"] as const;

const inspectionTypeValues = new Set<string>(Object.keys(inspectionTypeRegistry));

const customerSiteImportRowSchema = z.object({
  customerName: z.string().trim().min(1),
  contactName: z.string().trim().optional().default(""),
  billingEmail: z.string().trim().optional().default(""),
  phone: z.string().trim().optional().default(""),
  siteName: z.string().trim().optional().default(""),
  addressLine1: z.string().trim().optional().default(""),
  addressLine2: z.string().trim().optional().default(""),
  city: z.string().trim().optional().default(""),
  state: z.string().trim().optional().default(""),
  postalCode: z.string().trim().optional().default(""),
  siteNotes: z.string().trim().optional().default(""),
  assetName: z.string().trim().optional().default(""),
  assetTag: z.string().trim().optional().default(""),
  assetInspectionTypes: z.string().trim().optional().default(""),
  assetLocation: z.string().trim().optional().default(""),
  assetManufacturer: z.string().trim().optional().default(""),
  assetModel: z.string().trim().optional().default(""),
  assetSerialNumber: z.string().trim().optional().default("")
}).transform((row) => ({
  ...row,
  siteName: row.siteName || row.customerName,
  addressLine1: row.addressLine1 || "Unknown",
  city: row.city || "Unknown",
  state: row.state || "Unknown",
  postalCode: row.postalCode || "Unknown"
})).superRefine((row, ctx) => {
  const hasAssetData = [
    row.assetName,
    row.assetTag,
    row.assetInspectionTypes,
    row.assetLocation,
    row.assetManufacturer,
    row.assetModel,
    row.assetSerialNumber
  ].some((value) => value.trim().length > 0);

  if (hasAssetData && row.assetName.trim().length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Asset name is required when asset columns are provided.",
      path: ["assetName"]
    });
  }
});

export type CustomerSiteImportRow = z.infer<typeof customerSiteImportRowSchema>;

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function normalizeHeader(value: string) {
  const trimmed = value.trim();
  return headerAliases[trimmed] ?? trimmed;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === "\"") {
      const nextCharacter = line[index + 1];
      if (inQuotes && nextCharacter === "\"") {
        current += "\"";
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

function normalizeInspectionTypeToken(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function parseInspectionTypes(input: string, rowNumber: number) {
  if (!input.trim()) {
    return [] as InspectionType[];
  }

  const values = input
    .split(/[|;,]/)
    .map(normalizeInspectionTypeToken)
    .filter((value) => value.length > 0);

  const uniqueValues = [...new Set(values)];
  const invalid = uniqueValues.filter((value) => !inspectionTypeValues.has(value));
  if (invalid.length > 0) {
    throw new Error(`Row ${rowNumber}: Invalid asset inspection types: ${invalid.join(", ")}`);
  }

  return uniqueValues as InspectionType[];
}

function buildAssetMetadata(row: CustomerSiteImportRow, existingMetadata: unknown): JsonObject | undefined {
  const metadata: JsonObject = existingMetadata && typeof existingMetadata === "object" && !Array.isArray(existingMetadata)
    ? { ...(existingMetadata as Record<string, JsonValue>) }
    : {};

  if (row.assetLocation) {
    metadata.location = row.assetLocation;
  }
  if (row.assetManufacturer) {
    metadata.manufacturer = row.assetManufacturer;
  }
  if (row.assetModel) {
    metadata.model = row.assetModel;
  }
  if (row.assetSerialNumber) {
    metadata.serialNumber = row.assetSerialNumber;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export function parseCustomerSiteImportCsv(input: string) {
  const lines = input
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("CSV file is empty.");
  }

  const headerValues = parseCsvLine(lines[0] ?? "").map(normalizeHeader);
  const missingHeaders = minimumImportHeaders.filter((header) => !headerValues.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`CSV is missing required columns: ${missingHeaders.join(", ")}`);
  }

  const rows = lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    const rawRecord = Object.fromEntries(
      customerSiteImportHeaders.map((header) => {
        const index = headerValues.indexOf(header);
        return [header, index >= 0 ? values[index] ?? "" : ""];
      })
    );

    const parsed = customerSiteImportRowSchema.safeParse(rawRecord);
    if (!parsed.success) {
      throw new Error(`Row ${rowIndex + 2}: ${parsed.error.issues[0]?.message ?? "Invalid import row."}`);
    }

    return parsed.data;
  });

  if (rows.length === 0) {
    throw new Error("CSV must include at least one data row.");
  }

  return rows;
}

export function getCustomerSiteImportTemplateCsv() {
  return [
    customerSiteImportHeaders.join(","),
    [
      "Pinecrest Property Management",
      "Alyssa Reed",
      "ap@pinecrestpm.com",
      "312-555-0110",
      "Pinecrest Tower",
      "100 State St",
      "",
      "Chicago",
      "IL",
      "60601",
      "Annual inspections",
      "Lobby extinguisher bank",
      "EXT-100",
      "fire_extinguisher",
      "Lobby by east stair",
      "Amerex",
      "",
      "AMX-44021"
    ].join(",")
  ].join("\n");
}

export function getAcceptedCustomerSiteImportHeaders() {
  return {
    canonical: [...customerSiteImportHeaders],
    aliases: Object.keys(headerAliases)
  };
}

export async function importCustomerSiteCsv(actor: ActorContext, csv: string) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only tenant and office administrators can import customers, sites, and assets.");
  }

  const tenantId = parsedActor.tenantId as string;
  const rows = parseCustomerSiteImportCsv(csv);

  let customersCreated = 0;
  let customersUpdated = 0;
  let sitesCreated = 0;
  let sitesUpdated = 0;
  let assetsCreated = 0;
  let assetsUpdated = 0;
  let quickBooksCustomersSynced = 0;
  let quickBooksCustomerSyncFailures = 0;

  let quickBooksConnected = false;
  try {
    const quickBooksStatus = await getTenantQuickBooksConnectionStatus(actor);
    quickBooksConnected = quickBooksStatus.connection.connected;
  } catch {
    quickBooksConnected = false;
  }

  for (const [index, row] of rows.entries()) {
    const existingCustomer = await prisma.customerCompany.findFirst({
      where: {
        tenantId,
        name: row.customerName
      }
    });

    const customer = existingCustomer
      ? await prisma.customerCompany.update({
          where: { id: existingCustomer.id },
          data: {
            contactName: row.contactName || existingCustomer.contactName,
            billingEmail: row.billingEmail || existingCustomer.billingEmail,
            phone: row.phone || existingCustomer.phone
          }
        })
      : await prisma.customerCompany.create({
          data: {
            tenantId,
            name: row.customerName,
            contactName: row.contactName || null,
            billingEmail: row.billingEmail || null,
            phone: row.phone || null
          }
        });

    if (existingCustomer) {
      customersUpdated += 1;
    } else {
      customersCreated += 1;
    }

    if (quickBooksConnected) {
      try {
        await syncTradeWorxCustomerCompanyToQuickBooks(actor, customer.id);
        quickBooksCustomersSynced += 1;
      } catch {
        quickBooksCustomerSyncFailures += 1;
      }
    }

    const existingSite = await prisma.site.findFirst({
      where: {
        tenantId,
        customerCompanyId: customer.id,
        name: row.siteName,
        addressLine1: row.addressLine1
      }
    });

    const site = existingSite
      ? await prisma.site.update({
          where: { id: existingSite.id },
          data: {
            addressLine2: row.addressLine2 || null,
            city: row.city,
            state: row.state,
            postalCode: row.postalCode,
            notes: row.siteNotes || existingSite.notes
          }
        })
      : await prisma.site.create({
          data: {
            tenantId,
            customerCompanyId: customer.id,
            name: row.siteName,
            addressLine1: row.addressLine1,
            addressLine2: row.addressLine2 || null,
            city: row.city,
            state: row.state,
            postalCode: row.postalCode,
            notes: row.siteNotes || null
          }
        });

    if (existingSite) {
      sitesUpdated += 1;
    } else {
      sitesCreated += 1;
    }

    if (!row.assetName) {
      continue;
    }

    const inspectionTypes = parseInspectionTypes(row.assetInspectionTypes, index + 2);
    const existingAsset = await prisma.asset.findFirst({
      where: row.assetTag
        ? {
            tenantId,
            siteId: site.id,
            assetTag: row.assetTag
          }
        : {
            tenantId,
            siteId: site.id,
            name: row.assetName
          }
    });

    if (existingAsset) {
      await prisma.asset.update({
        where: { id: existingAsset.id },
        data: {
          name: row.assetName,
          assetTag: row.assetTag || existingAsset.assetTag,
          inspectionTypes: inspectionTypes.length > 0 ? inspectionTypes : existingAsset.inspectionTypes,
          metadata: buildAssetMetadata(row, existingAsset.metadata)
        }
      });
      assetsUpdated += 1;
    } else {
      await prisma.asset.create({
        data: {
          tenantId,
          siteId: site.id,
          name: row.assetName,
          assetTag: row.assetTag || null,
          inspectionTypes,
          metadata: buildAssetMetadata(row, null)
        }
      });
      assetsCreated += 1;
    }
  }

  return {
    rowCount: rows.length,
    customersCreated,
    customersUpdated,
    quickBooksCustomersSynced,
    quickBooksCustomerSyncFailures,
    sitesCreated,
    sitesUpdated,
    assetsCreated,
    assetsUpdated
  };
}
