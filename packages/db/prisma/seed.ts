import { hash } from "bcryptjs";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

import { PrismaClient, RecurrenceFrequency } from "@prisma/client";
import { reportStatuses, type ReportStatus } from "@testworx/types";

function loadRootEnv() {
  const envPath = resolve(__dirname, "..", "..", "..", ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const contents = readFileSync(envPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const rawValue = line.slice(equalsIndex + 1).trim();
    const value = ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'")))
      ? rawValue.slice(1, -1)
      : rawValue;

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadRootEnv();

const prisma = new PrismaClient();
const password = "Password123!";

function requireDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required before running db:seed. Copy .env.example to .env and point it at a local PostgreSQL database.");
  }
}

function buildPdfStorageKey() {
  const minimalPdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 18 Tf 36 120 Td (Seeded report packet) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000191 00000 n 
trailer
<< /Root 1 0 R /Size 5 >>
startxref
285
%%EOF`;
  return `data:application/pdf;base64,${Buffer.from(minimalPdf).toString("base64")}`;
}

async function createSeedInspection(input: {
  tenantId: string;
  customerCompanyId: string;
  siteId: string;
  assignedTechnicianId: string | null;
  createdByUserId: string;
  scheduledStart: Date;
  scheduledEnd?: Date | null;
  status?: "to_be_completed" | "scheduled" | "in_progress" | "completed" | "cancelled";
  notes: string;
  claimable: boolean;
  tasks: Array<{
    inspectionType: "fire_extinguisher" | "fire_alarm" | "wet_fire_sprinkler" | "joint_commission_fire_sprinkler" | "backflow" | "fire_pump" | "dry_fire_sprinkler" | "kitchen_suppression" | "industrial_suppression" | "emergency_exit_lighting";
    frequency: RecurrenceFrequency;
    report: {
      technicianId: string | null;
      status: ReportStatus;
      finalizedAt?: Date | null;
      contentJson: object;
    };
  }>;
}) {
  const inspection = await prisma.inspection.create({
    data: {
      tenantId: input.tenantId,
      customerCompanyId: input.customerCompanyId,
      siteId: input.siteId,
      assignedTechnicianId: input.assignedTechnicianId,
      createdByUserId: input.createdByUserId,
      scheduledStart: input.scheduledStart,
      scheduledEnd: input.scheduledEnd ?? null,
      status: input.status ?? "to_be_completed",
      notes: input.notes,
      claimable: input.claimable
    }
  });

  if (input.assignedTechnicianId) {
    await prisma.inspectionTechnicianAssignment.create({
      data: {
        tenantId: input.tenantId,
        inspectionId: inspection.id,
        technicianId: input.assignedTechnicianId
      }
    });
  }

  const tasks = [] as Array<{ id: string; inspectionType: string; report: { id: string } }>;
  for (const [taskIndex, task] of input.tasks.entries()) {
    const createdTask = await prisma.inspectionTask.create({
      data: {
        tenantId: input.tenantId,
        inspectionId: inspection.id,
        inspectionType: task.inspectionType,
        sortOrder: taskIndex
      }
    });

    await prisma.inspectionRecurrence.create({
      data: {
        tenantId: input.tenantId,
        inspectionTaskId: createdTask.id,
        seriesId: createdTask.id,
        frequency: task.frequency,
        anchorScheduledStart: input.scheduledStart,
        nextDueAt: task.frequency === RecurrenceFrequency.ONCE ? null : new Date(input.scheduledStart.getTime() + 86_400_000)
      }
    });

    const report = await prisma.inspectionReport.create({
      data: {
        tenantId: input.tenantId,
        inspectionId: inspection.id,
        inspectionTaskId: createdTask.id,
        technicianId: task.report.technicianId,
        status: task.report.status,
        finalizedAt: task.report.finalizedAt ?? null,
        contentJson: task.report.contentJson as never
      }
    });

    tasks.push({
      id: createdTask.id,
      inspectionType: createdTask.inspectionType,
      report: { id: report.id }
    });
  }

  return {
    ...inspection,
    tasks
  };
}

async function main() {
  requireDatabaseUrl();
  const passwordHash = await hash(password, 12);

  await prisma.stripeWebhookEvent.deleteMany();
  await prisma.customerIntakeAttachment.deleteMany();
  await prisma.customerIntakeRequest.deleteMany();
  await prisma.quoteReminderDispatch.deleteMany();
  await prisma.quoteLineItem.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.emailReminderSendLog.deleteMany();
  await prisma.accountInvitation.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.technicianDeviceRegistration.deleteMany();
  await prisma.technicianNotification.deleteMany();
  await prisma.inspectionTechnicianAssignment.deleteMany();
  await prisma.inspectionCloseoutRequest.deleteMany();
  await prisma.inspectionAmendment.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.deficiency.deleteMany();
  await prisma.userManualState.deleteMany();
  await prisma.manualApplicability.deleteMany();
  await prisma.manual.deleteMany();
  await prisma.inspectionBillingSummary.deleteMany();
  await prisma.billingResolutionSnapshot.deleteMany();
  await prisma.billingItemCatalogMatch.deleteMany();
  await prisma.quickBooksCatalogItemAlias.deleteMany();
  await prisma.quickBooksItemMap.deleteMany();
  await prisma.quickBooksItemCache.deleteMany();
  await prisma.quickBooksCatalogItem.deleteMany();
  await prisma.complianceReportingFeeRule.deleteMany();
  await prisma.serviceFeeRule.deleteMany();
  await prisma.inspectionDocument.deleteMany();
  await prisma.signature.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.workOrderProviderContext.deleteMany();
  await prisma.inspectionReport.deleteMany();
  await prisma.inspectionRecurrence.deleteMany();
  await prisma.inspectionTask.deleteMany();
  await prisma.inspection.deleteMany();
  await prisma.serviceSiteProviderAssignment.deleteMany();
  await prisma.providerContractRate.deleteMany();
  await prisma.providerContractProfile.deleteMany();
  await prisma.contractProviderAccount.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.site.deleteMany();
  await prisma.user.deleteMany();
  await prisma.customerCompany.deleteMany();
  await prisma.billingContractProfile.deleteMany();
  await prisma.billingPayerAccount.deleteMany();
  await prisma.tenantInvoiceSequence.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.subscriptionPlan.deleteMany();

  const [starterPlan, professionalPlan, enterprisePlan] = await Promise.all([
    prisma.subscriptionPlan.create({
      data: {
        code: "starter",
        name: "Starter",
        monthlyPriceCents: 19900,
        maxUsers: 12,
        featureFlags: { customerPortal: true, reportDrafts: true, advancedRecurrence: false, uploadedInspectionPdfs: false }
      }
    }),
    prisma.subscriptionPlan.create({
      data: {
        code: "professional",
        name: "Professional",
        monthlyPriceCents: 49900,
        maxUsers: 50,
        featureFlags: { customerPortal: true, reportDrafts: true, brandedPdf: true, advancedRecurrence: true, uploadedInspectionPdfs: true }
      }
    }),
    prisma.subscriptionPlan.create({
      data: {
        code: "enterprise",
        name: "Enterprise",
        monthlyPriceCents: 99900,
        maxUsers: 250,
        featureFlags: { customerPortal: true, reportDrafts: true, brandedPdf: true, premiumSupport: true, advancedRecurrence: true, uploadedInspectionPdfs: true }
      }
    })
  ]);

  void starterPlan;
  void enterprisePlan;

  const tenant = await prisma.tenant.create({
    data: {
      slug: "evergreen-fire",
      name: "Evergreen Fire Protection",
      subscriptionPlanId: professionalPlan.id,
      billingEmail: "billing@evergreenfire.com",
      stripeCustomerId: "cus_demo_evergreen",
      stripeSubscriptionId: "sub_demo_evergreen",
      stripeSubscriptionStatus: "active",
      stripePriceId: "price_demo_professional",
      stripeCurrentPeriodEndsAt: new Date("2026-04-01T00:00:00.000Z"),
      stripeCancelAtPeriodEnd: false,
      stripeSubscriptionSyncedAt: new Date("2026-03-13T15:00:00.000Z"),
      stripeSubscriptionEventCreatedAt: new Date("2026-03-13T14:59:00.000Z"),
      stripeSubscriptionEventId: "evt_seed_evergreen_active",
      branding: {
        legalBusinessName: "Evergreen Fire Protection, LLC",
        primaryColor: "#1E3A5F",
        accentColor: "#C2410C",
        phone: "312-555-0199",
        email: "service@evergreenfire.com",
        website: "evergreenfire.example.com",
        addressLine1: "410 West Erie Street",
        city: "Chicago",
        state: "IL",
        postalCode: "60654"
      }
    }
  });

  const pinecrest = await prisma.customerCompany.create({
    data: {
      tenantId: tenant.id,
      name: "Pinecrest Property Management",
      contactName: "Alyssa Reed",
      billingEmail: "ap@pinecrestpm.com",
      phone: "312-555-0110",
      serviceAddressLine1: "1501 Pine Street",
      serviceCity: "Chicago",
      serviceState: "IL",
      servicePostalCode: "60611",
      serviceCountry: "USA",
      billingAddressSameAsService: false,
      billingAddressLine1: "PO Box 1842",
      billingCity: "Chicago",
      billingState: "IL",
      billingPostalCode: "60690",
      billingCountry: "USA",
      paymentTermsCode: "net_30",
      notes: "Prefers invoice summary emailed to AP and facilities."
    }
  });
  const harbor = await prisma.customerCompany.create({
    data: {
      tenantId: tenant.id,
      name: "Harbor View Hospital",
      contactName: "Jon Morales",
      billingEmail: "facilities@harborview.org",
      phone: "312-555-0111",
      serviceAddressLine1: "220 Harbor Drive",
      serviceCity: "Chicago",
      serviceState: "IL",
      servicePostalCode: "60616",
      serviceCountry: "USA",
      billingAddressSameAsService: true,
      paymentTermsCode: "net_15",
      notes: "Technicians must check in with security before entering plant rooms."
    }
  });
  const summit = await prisma.customerCompany.create({
    data: {
      tenantId: tenant.id,
      name: "Summit Logistics",
      contactName: "Dana Cho",
      billingEmail: "ops@summitlogistics.com",
      phone: "312-555-0112",
      serviceAddressLine1: "9900 Summit Parkway",
      serviceCity: "Bedford Park",
      serviceState: "IL",
      servicePostalCode: "60638",
      serviceCountry: "USA",
      billingAddressSameAsService: true,
      paymentTermsCode: "net_30",
      notes: "Collect payment on site for non-contracted emergency work."
    }
  });

  const [platformAdmin, tenantAdmin, officeAdmin, tech1, tech2, tech3, customer1, customer2, customer3] = await Promise.all([
    prisma.user.create({ data: { email: "platform@nwfiredemo.com", name: "NWFIRE Platform", passwordHash, role: "platform_admin" } }),
    prisma.user.create({ data: { tenantId: tenant.id, email: "tenantadmin@evergreenfire.com", name: "Morgan Blake", passwordHash, role: "tenant_admin" } }),
    prisma.user.create({ data: { tenantId: tenant.id, email: "office@evergreenfire.com", name: "Jordan Hayes", passwordHash, role: "office_admin" } }),
    prisma.user.create({ data: { tenantId: tenant.id, email: "tech1@evergreenfire.com", name: "Alex Turner", passwordHash, role: "technician" } }),
    prisma.user.create({ data: { tenantId: tenant.id, email: "tech2@evergreenfire.com", name: "Casey Nguyen", passwordHash, role: "technician" } }),
    prisma.user.create({ data: { tenantId: tenant.id, email: "tech3@evergreenfire.com", name: "Riley Brooks", passwordHash, role: "technician" } }),
    prisma.user.create({ data: { tenantId: tenant.id, customerCompanyId: pinecrest.id, email: "facilities@pinecrestpm.com", name: "Pinecrest Facilities", passwordHash, role: "customer_user" } }),
    prisma.user.create({ data: { tenantId: tenant.id, customerCompanyId: harbor.id, email: "maintenance@harborview.org", name: "Harbor Maintenance", passwordHash, role: "customer_user" } }),
    prisma.user.create({ data: { tenantId: tenant.id, customerCompanyId: summit.id, email: "ehs@summitlogistics.com", name: "Summit EHS", passwordHash, role: "customer_user" } })
  ]);

  const [pinecrestTower, pinecrestWest, harborMain, summitHub] = await Promise.all([
    prisma.site.create({ data: { tenantId: tenant.id, customerCompanyId: pinecrest.id, name: "Pinecrest Tower", addressLine1: "100 State St", city: "Chicago", state: "IL", postalCode: "60601" } }),
    prisma.site.create({ data: { tenantId: tenant.id, customerCompanyId: pinecrest.id, name: "Pinecrest West", addressLine1: "245 Lake Ave", city: "Naperville", state: "IL", postalCode: "60540" } }),
    prisma.site.create({ data: { tenantId: tenant.id, customerCompanyId: harbor.id, name: "Harbor Main Campus", addressLine1: "800 Harbor Dr", city: "Chicago", state: "IL", postalCode: "60611" } }),
    prisma.site.create({ data: { tenantId: tenant.id, customerCompanyId: summit.id, name: "Summit Distribution Hub", addressLine1: "4250 Commerce Way", city: "Joliet", state: "IL", postalCode: "60431" } })
  ]);

  await prisma.complianceReportingFeeRule.createMany({
    data: [
      {
        tenantId: tenant.id,
        division: "fire_alarm",
        city: "Chicago",
        normalizedCity: "CHICAGO",
        county: "Cook",
        normalizedCounty: "COOK",
        state: "IL",
        normalizedState: "IL",
        feeAmount: 18,
        active: true
      },
      {
        tenantId: tenant.id,
        division: "fire_sprinkler",
        city: "Chicago",
        normalizedCity: "CHICAGO",
        county: "Cook",
        normalizedCounty: "COOK",
        state: "IL",
        normalizedState: "IL",
        feeAmount: 27.5,
        active: true
      },
      {
        tenantId: tenant.id,
        division: "kitchen_suppression",
        city: "Naperville",
        normalizedCity: "NAPERVILLE",
        county: "DuPage",
        normalizedCounty: "DUPAGE",
        state: "IL",
        normalizedState: "IL",
        feeAmount: 22,
        active: true
      }
    ]
  });

  await prisma.asset.createMany({
    data: [
      { tenantId: tenant.id, siteId: pinecrestTower.id, name: "Lobby extinguisher bank", assetTag: "EXT-100", inspectionTypes: ["fire_extinguisher"], metadata: { location: "Lobby by east stair", manufacturer: "amerex", ulRating: "2a_10bc", serialNumber: "AMX-44021", extinguisherType: "ABC dry chemical" } },
      {
        tenantId: tenant.id,
        siteId: pinecrestTower.id,
        name: "Main fire alarm panel",
        assetTag: "FAP-100",
        inspectionTypes: ["fire_alarm"],
        metadata: {
          alarmRole: "control_panel",
          location: "Ground floor electrical room",
          panelName: "Main fire alarm panel",
          manufacturer: "Notifier",
          model: "NFS2-3030",
          panelModel: "NFS2-3030",
          serialNumber: "FAP-3030-001",
          communicationPathType: "dual_path"
        }
      },
      {
        tenantId: tenant.id,
        siteId: pinecrestTower.id,
        name: "Lobby pull station",
        assetTag: "FAI-101",
        inspectionTypes: ["fire_alarm"],
        metadata: {
          alarmRole: "initiating_device",
          location: "Lobby north exit",
          manufacturer: "Notifier",
          model: "BG-12LX",
          serialNumber: "PS-101",
          deviceType: "pull_station"
        }
      },
      {
        tenantId: tenant.id,
        siteId: pinecrestTower.id,
        name: "Level 2 smoke detector",
        assetTag: "FAI-102",
        inspectionTypes: ["fire_alarm"],
        metadata: {
          alarmRole: "initiating_device",
          location: "Second floor east corridor",
          manufacturer: "System Sensor",
          model: "2251B",
          serialNumber: "SD-2251-77",
          deviceType: "smoke_detector"
        }
      },
      {
        tenantId: tenant.id,
        siteId: pinecrestTower.id,
        name: "Main lobby horn strobe",
        assetTag: "FAN-201",
        inspectionTypes: ["fire_alarm"],
        metadata: {
          alarmRole: "notification_appliance",
          location: "Main lobby",
          manufacturer: "System Sensor",
          model: "P2RL",
          serialNumber: "NA-201",
          applianceType: "horn_strobe",
          candelaOrType: "110 cd"
        }
      },
      {
        tenantId: tenant.id,
        siteId: pinecrestTower.id,
        name: "West stair speaker strobe",
        assetTag: "FAN-202",
        inspectionTypes: ["fire_alarm"],
        metadata: {
          alarmRole: "notification_appliance",
          location: "West stair level 3",
          manufacturer: "Wheelock",
          model: "ET70WP",
          serialNumber: "NA-202",
          applianceType: "speaker_strobe",
          candelaOrType: "75 cd"
        }
      },
      { tenantId: tenant.id, siteId: harborMain.id, name: "Wet riser zone A", assetTag: "SPR-200", inspectionTypes: ["wet_fire_sprinkler"], metadata: { location: "Central riser room", componentType: "riser", valveCount: 6 } },
      { tenantId: tenant.id, siteId: harborMain.id, name: "Backflow preventer", assetTag: "BF-210", inspectionTypes: ["backflow"], metadata: { location: "Loading dock mechanical", assemblyType: "rpz", sizeInches: 4, serialNumber: "BF-RPZ-4421" } },
      { tenantId: tenant.id, siteId: harborMain.id, name: "Fire pump assembly", assetTag: "PMP-220", inspectionTypes: ["fire_pump"], metadata: { location: "Pump room", controller: "Metron EconoMatic", driverType: "Electric" } },
      { tenantId: tenant.id, siteId: summitHub.id, name: "Warehouse dry valve", assetTag: "DRY-300", inspectionTypes: ["dry_fire_sprinkler"], metadata: { location: "North warehouse mezzanine", valveType: "Dry pipe valve", compressorType: "Tank-mounted air compressor", quickOpeningDevice: "Accelerator installed", drainCount: 3 } },
      { tenantId: tenant.id, siteId: summitHub.id, name: "Paint booth industrial suppression", assetTag: "IND-301", inspectionTypes: ["industrial_suppression"], metadata: { location: "Paint booth line 2", protectedProcess: "Paint booth line 2", releasePanel: "Kidde ARIES", shutdownDependency: "Conveyor stop and exhaust fan shutdown", cylinderCount: 6 } },
      { tenantId: tenant.id, siteId: summitHub.id, name: "Emergency egress lighting", assetTag: "EEL-302", inspectionTypes: ["emergency_exit_lighting"], metadata: { location: "Warehouse aisles A-C", fixtureArea: "Warehouse aisles A-C", fixtureType: "Combo exit/emergency unit", batteryType: "Sealed lead acid", fixtureCount: 12 } },
      { tenantId: tenant.id, siteId: pinecrestWest.id, name: "Kitchen hood system", assetTag: "KIT-400", inspectionTypes: ["kitchen_suppression"], metadata: { location: "Ground floor commercial kitchen", protectedArea: "Line cook hood", pullStationLocation: "South egress by prep sink", tankType: "Wet chemical", applianceCount: 4 } }
    ]
  });

  const inspections = [
    {
      customerCompanyId: pinecrest.id,
      siteId: pinecrestTower.id,
      assignedTechnicianId: tech1.id,
      createdByUserId: officeAdmin.id,
      scheduledStart: new Date("2026-03-12T09:00:00-05:00"),
      notes: "Annual extinguisher and alarm combo visit.",
      claimable: false,
      tasks: [
        { inspectionType: "fire_extinguisher", frequency: RecurrenceFrequency.ANNUAL },
        { inspectionType: "fire_alarm", frequency: RecurrenceFrequency.ANNUAL }
      ]
    },
    {
      customerCompanyId: harbor.id,
      siteId: harborMain.id,
      assignedTechnicianId: tech2.id,
      createdByUserId: officeAdmin.id,
      scheduledStart: new Date("2026-03-14T08:30:00-05:00"),
      notes: "Quarterly sprinkler, backflow, and pump testing.",
      claimable: false,
      tasks: [
        { inspectionType: "wet_fire_sprinkler", frequency: RecurrenceFrequency.QUARTERLY },
        { inspectionType: "backflow", frequency: RecurrenceFrequency.ANNUAL },
        { inspectionType: "fire_pump", frequency: RecurrenceFrequency.MONTHLY }
      ]
    },
    {
      customerCompanyId: summit.id,
      siteId: summitHub.id,
      assignedTechnicianId: null,
      createdByUserId: officeAdmin.id,
      scheduledStart: new Date("2026-03-15T10:00:00-05:00"),
      notes: "Unassigned warehouse dry system and industrial suppression inspection.",
      claimable: true,
      tasks: [
        { inspectionType: "dry_fire_sprinkler", frequency: RecurrenceFrequency.QUARTERLY },
        { inspectionType: "industrial_suppression", frequency: RecurrenceFrequency.SEMI_ANNUAL },
        { inspectionType: "emergency_exit_lighting", frequency: RecurrenceFrequency.MONTHLY }
      ]
    },
    {
      customerCompanyId: pinecrest.id,
      siteId: pinecrestWest.id,
      assignedTechnicianId: tech3.id,
      createdByUserId: tenantAdmin.id,
      scheduledStart: new Date("2026-03-18T13:00:00-05:00"),
      notes: "Kitchen suppression follow-up.",
      claimable: false,
      tasks: [
        { inspectionType: "kitchen_suppression", frequency: RecurrenceFrequency.SEMI_ANNUAL }
      ]
    }
  ];

  for (const [index, inspection] of inspections.entries()) {
    const created = await createSeedInspection({
      tenantId: tenant.id,
      customerCompanyId: inspection.customerCompanyId,
      siteId: inspection.siteId,
      assignedTechnicianId: inspection.assignedTechnicianId,
      createdByUserId: inspection.createdByUserId,
      scheduledStart: inspection.scheduledStart,
      notes: inspection.notes,
      claimable: inspection.claimable,
      tasks: inspection.tasks.map((task, taskIndex) => ({
        inspectionType: task.inspectionType,
        frequency: task.frequency,
        report: {
          technicianId: inspection.assignedTechnicianId,
          status: index === 0 && taskIndex === 0 ? reportStatuses.finalized : reportStatuses.draft,
          finalizedAt: index === 0 && taskIndex === 0 ? new Date("2026-03-12T11:15:00-05:00") : null,
          contentJson: {
            templateVersion: 1,
            inspectionType: task.inspectionType,
            overallNotes: "Initial seeded draft for demo walkthrough.",
            sectionOrder: ["inventory"],
            activeSectionId: "inventory",
            sections: {
              inventory: {
                status: "pass",
                notes: "Seeded notes",
                fields: { unitsInspected: 12, serviceTagsCurrent: true }
              }
            },
            deficiencies: [],
            attachments: [],
            signatures: {},
            context: {
              siteName: index === 0 ? "Pinecrest Tower" : "",
              customerName: index === 0 ? "Pinecrest Property Management" : "",
              scheduledDate: inspection.scheduledStart.toISOString(),
              assetCount: 2,
              priorReportSummary: ""
            }
          }
        }
      }))
    });

    const firstReport = created.tasks[0]?.report;
    if (firstReport) {
      await prisma.deficiency.create({
        data: {
          tenantId: tenant.id,
          siteId: inspection.siteId,
          inspectionId: created.id,
          inspectionReportId: firstReport.id,
          reportType: created.tasks[0]?.inspectionType ?? "fire_extinguisher",
          section: "inventory",
          source: "seed",
          sourceRowKey: `seed-${created.id}`,
          title: "Expired extinguisher service tag",
          description: "Unit EXT-100 requires six-year maintenance and updated tag.",
          severity: "medium",
          status: "open"
        }
      });

      if (index === 0) {
        await prisma.attachment.createMany({
          data: [
            {
              tenantId: tenant.id,
              inspectionId: created.id,
              inspectionReportId: firstReport.id,
              kind: "pdf",
              source: "generated",
              fileName: "pinecrest-tower-fire-extinguisher-report.pdf",
              mimeType: "application/pdf",
              storageKey: buildPdfStorageKey(),
              customerVisible: true
            },
            {
              tenantId: tenant.id,
              inspectionId: created.id,
              kind: "pdf",
              source: "uploaded",
              fileName: "tenant-scope-letter.pdf",
              mimeType: "application/pdf",
              storageKey: buildPdfStorageKey(),
              customerVisible: true
            },
            {
              tenantId: tenant.id,
              inspectionId: created.id,
              inspectionReportId: firstReport.id,
              kind: "photo",
              source: "uploaded",
              fileName: "extinguisher-bank-overview.jpg",
              mimeType: "image/png",
              storageKey: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=",
              customerVisible: false
            }
          ] as never
        });

        await prisma.signature.createMany({
          data: [
            {
              tenantId: tenant.id,
              inspectionReportId: firstReport.id,
              signerName: tech1.name,
              kind: "technician",
              imageDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=",
              signedAt: new Date("2026-03-12T11:00:00-05:00")
            },
            {
              tenantId: tenant.id,
              inspectionReportId: firstReport.id,
              signerName: pinecrest.contactName ?? "Customer Contact",
              kind: "customer",
              imageDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=",
              signedAt: new Date("2026-03-12T11:05:00-05:00")
            }
          ]
        });
      }
    }
  }


  const northshoreTenant = await prisma.tenant.create({
    data: {
      slug: "northshore-life-safety",
      name: "Northshore Life Safety",
      subscriptionPlanId: starterPlan.id,
      billingEmail: "billing@northshorelife.com",
      stripeSubscriptionStatus: "trialing",
      stripePriceId: "price_demo_starter",
      stripeCurrentPeriodEndsAt: new Date("2026-03-28T00:00:00.000Z"),
      stripeCancelAtPeriodEnd: false,
      stripeSubscriptionSyncedAt: new Date("2026-03-13T10:30:00.000Z"),
      stripeSubscriptionEventCreatedAt: new Date("2026-03-13T10:29:00.000Z"),
      stripeSubscriptionEventId: "evt_seed_northshore_trialing",
      branding: {
        legalBusinessName: "Northshore Life Safety, Inc.",
        primaryColor: "#234E52",
        accentColor: "#B45309",
        phone: "847-555-0133",
        email: "service@northshorelife.com",
        addressLine1: "88 Lakeview Pkwy",
        city: "Evanston",
        state: "IL",
        postalCode: "60201"
      }
    }
  });

  const northshoreCustomer = await prisma.customerCompany.create({
    data: {
      tenantId: northshoreTenant.id,
      name: "Lakefront Residences",
      contactName: "Mina Patel",
      billingEmail: "ap@lakefrontresidences.com",
      phone: "847-555-0140",
      serviceAddressLine1: "10 Lakefront Plaza",
      serviceCity: "Evanston",
      serviceState: "IL",
      servicePostalCode: "60201",
      serviceCountry: "USA",
      billingAddressSameAsService: true,
      paymentTermsCode: "net_30"
    }
  });

  const [
    ansulServiceAttachment,
    ansulInspectionAttachment,
    pyrochemTroubleshootingAttachment,
    rangeGuardTechAttachment
  ] = await Promise.all([
    prisma.attachment.create({
      data: {
        tenantId: tenant.id,
        kind: "pdf",
        source: "uploaded",
        fileName: "ansul-r102-service-manual.pdf",
        mimeType: "application/pdf",
        storageKey: buildPdfStorageKey()
      }
    }),
    prisma.attachment.create({
      data: {
        tenantId: tenant.id,
        kind: "pdf",
        source: "uploaded",
        fileName: "ansul-r102-inspection-checklist.pdf",
        mimeType: "application/pdf",
        storageKey: buildPdfStorageKey()
      }
    }),
    prisma.attachment.create({
      data: {
        tenantId: tenant.id,
        kind: "pdf",
        source: "uploaded",
        fileName: "pyrochem-monarch-troubleshooting-guide.pdf",
        mimeType: "application/pdf",
        storageKey: buildPdfStorageKey()
      }
    }),
    prisma.attachment.create({
      data: {
        tenantId: tenant.id,
        kind: "pdf",
        source: "uploaded",
        fileName: "range-guard-tech-data.pdf",
        mimeType: "application/pdf",
        storageKey: buildPdfStorageKey()
      }
    })
  ]);

  const [ansulServiceManual, ansulInspectionManual, pyrochemManual, rangeGuardManual] = await Promise.all([
    prisma.manual.create({
      data: {
        tenantId: tenant.id,
        title: "ANSUL R-102 Service Manual",
        manufacturer: "ANSUL",
        systemCategory: "wet_chemical",
        productFamily: "R-102",
        model: "Restaurant Fire Suppression System",
        documentType: "service",
        revisionLabel: "Rev 2025.3",
        revisionDate: new Date("2025-03-15T00:00:00.000Z"),
        description: "Core service reference for wet chemical kitchen systems, including cartridge handling, maintenance intervals, and shutdown verification.",
        tags: ["service", "maintenance", "recharge", "kitchen", "wet chemical"],
        fileId: ansulServiceAttachment.id,
        fileName: ansulServiceAttachment.fileName,
        mimeType: ansulServiceAttachment.mimeType,
        pageCount: 84,
        source: "ANSUL distributor portal",
        isActive: true,
        isOfflineEligible: true,
        searchableTextStatus: "ready",
        searchableText: "service maintenance recharge shutdown cartridge nozzle chart kitchen wet chemical",
        createdByUserId: officeAdmin.id,
        updatedByUserId: officeAdmin.id
      }
    }),
    prisma.manual.create({
      data: {
        tenantId: tenant.id,
        title: "ANSUL R-102 Inspection Checklist and Reference",
        manufacturer: "ANSUL",
        systemCategory: "wet_chemical",
        productFamily: "R-102",
        model: "Inspection Reference",
        documentType: "inspection",
        revisionLabel: "2026 Annual",
        revisionDate: new Date("2026-01-09T00:00:00.000Z"),
        description: "Inspection-focused reference for field walkthroughs, nozzle verification, tank pressure checks, and final set condition review.",
        tags: ["inspection", "maintenance", "nozzle chart", "wet chemical"],
        fileId: ansulInspectionAttachment.id,
        fileName: ansulInspectionAttachment.fileName,
        mimeType: ansulInspectionAttachment.mimeType,
        pageCount: 36,
        source: "Internal field pack",
        isActive: true,
        isOfflineEligible: true,
        searchableTextStatus: "ready",
        searchableText: "inspection wet chemical nozzle chart maintenance checklist owner final set condition",
        createdByUserId: officeAdmin.id,
        updatedByUserId: officeAdmin.id
      }
    }),
    prisma.manual.create({
      data: {
        tenantId: tenant.id,
        title: "Pyro-Chem Monarch Industrial Dry Chemical Troubleshooting Guide",
        manufacturer: "Pyro-Chem",
        systemCategory: "industrial_dry_chemical",
        productFamily: "Monarch",
        model: "IDCS Platform",
        documentType: "troubleshooting",
        revisionLabel: "Rev B",
        revisionDate: new Date("2024-11-01T00:00:00.000Z"),
        description: "Field troubleshooting reference for industrial dry chemical systems, alarms, release failures, and detection troubleshooting.",
        tags: ["troubleshooting", "industrial dry chemical", "service", "parts"],
        fileId: pyrochemTroubleshootingAttachment.id,
        fileName: pyrochemTroubleshootingAttachment.fileName,
        mimeType: pyrochemTroubleshootingAttachment.mimeType,
        pageCount: 58,
        source: "Manufacturer tech archive",
        isActive: true,
        isOfflineEligible: true,
        searchableTextStatus: "ready",
        searchableText: "industrial dry chemical troubleshooting release alarm parts maintenance monarch pyro chem",
        createdByUserId: officeAdmin.id,
        updatedByUserId: officeAdmin.id
      }
    }),
    prisma.manual.create({
      data: {
        tenantId: tenant.id,
        title: "Range Guard Wet Chemical Technical Data Book",
        manufacturer: "Range Guard",
        systemCategory: "wet_chemical",
        productFamily: "RG Series",
        model: "RG-300",
        documentType: "tech_data",
        revisionLabel: "2025",
        revisionDate: new Date("2025-05-21T00:00:00.000Z"),
        description: "Tech data reference with agent quantities, nozzle coverage data, and component identification.",
        tags: ["tech data", "nozzle chart", "parts", "wet chemical"],
        fileId: rangeGuardTechAttachment.id,
        fileName: rangeGuardTechAttachment.fileName,
        mimeType: rangeGuardTechAttachment.mimeType,
        pageCount: 44,
        source: "Range Guard technical library",
        isActive: true,
        isOfflineEligible: false,
        searchableTextStatus: "ready",
        searchableText: "tech data wet chemical nozzle chart coverage parts range guard",
        createdByUserId: officeAdmin.id,
        updatedByUserId: officeAdmin.id
      }
    })
  ]);

  await prisma.userManualState.createMany({
    data: [
      {
        userId: tech1.id,
        manualId: ansulServiceManual.id,
        isFavorite: true,
        lastViewedAt: new Date("2026-04-16T16:15:00.000Z"),
        savedOfflineAt: new Date("2026-04-16T16:20:00.000Z")
      },
      {
        userId: tech1.id,
        manualId: pyrochemManual.id,
        isFavorite: true,
        lastViewedAt: new Date("2026-04-15T14:10:00.000Z")
      },
      {
        userId: tech1.id,
        manualId: ansulInspectionManual.id,
        isFavorite: false,
        lastViewedAt: new Date("2026-04-14T09:30:00.000Z")
      },
      {
        userId: tech2.id,
        manualId: rangeGuardManual.id,
        isFavorite: true,
        lastViewedAt: new Date("2026-04-12T11:05:00.000Z")
      }
    ]
  });

  const [northshoreAdmin, northshoreTech, northshoreCustomerUser] = await Promise.all([
    prisma.user.create({ data: { tenantId: northshoreTenant.id, email: "admin@northshorelife.com", name: "Taylor Singh", passwordHash, role: "tenant_admin" } }),
    prisma.user.create({ data: { tenantId: northshoreTenant.id, email: "tech@northshorelife.com", name: "Sam Ortega", passwordHash, role: "technician" } }),
    prisma.user.create({ data: { tenantId: northshoreTenant.id, customerCompanyId: northshoreCustomer.id, email: "facilities@lakefrontresidences.com", name: "Lakefront Facilities", passwordHash, role: "customer_user" } })
  ]);

  const northshoreSite = await prisma.site.create({
    data: { tenantId: northshoreTenant.id, customerCompanyId: northshoreCustomer.id, name: "Lakefront Residences - North Tower", addressLine1: "12 Sheridan Rd", city: "Evanston", state: "IL", postalCode: "60202" }
  });

  await prisma.complianceReportingFeeRule.create({
    data: {
      tenantId: northshoreTenant.id,
      division: "fire_alarm",
      city: "Evanston",
      normalizedCity: "EVANSTON",
      county: "Cook",
      normalizedCounty: "COOK",
      state: "IL",
      normalizedState: "IL",
      feeAmount: 15,
      active: true
    }
  });

  await prisma.asset.create({
    data: {
      tenantId: northshoreTenant.id,
      siteId: northshoreSite.id,
      name: "Main alarm panel",
      assetTag: "NSA-100",
      inspectionTypes: ["fire_alarm"],
      metadata: { alarmRole: "control_panel", location: "Front office electrical room", manufacturer: "Silent Knight", model: "6820", serialNumber: "NSA-100" }
    }
  });

  await createSeedInspection({
    tenantId: northshoreTenant.id,
    customerCompanyId: northshoreCustomer.id,
    siteId: northshoreSite.id,
    assignedTechnicianId: northshoreTech.id,
    createdByUserId: northshoreAdmin.id,
    scheduledStart: new Date("2026-03-16T08:00:00-05:00"),
    scheduledEnd: new Date("2026-03-16T10:00:00-05:00"),
    status: "scheduled",
    notes: "Demo secondary tenant visit for tenant-isolation walkthrough.",
    claimable: false,
    tasks: [{
      inspectionType: "fire_alarm",
      frequency: RecurrenceFrequency.ANNUAL,
      report: {
        technicianId: northshoreTech.id,
        status: reportStatuses.draft,
        contentJson: {
          templateVersion: 1,
          inspectionType: "fire_alarm",
          overallNotes: "Secondary tenant seeded report draft.",
          sectionOrder: ["control-panel"],
          activeSectionId: "control-panel",
          sections: {
            "control-panel": {
              status: "pending",
              notes: "",
              fields: { panelCondition: "", powerSuppliesNormal: false, troubleSignals: "" }
            }
          },
          deficiencies: [],
          attachments: [],
          signatures: {},
          context: {
            siteName: northshoreSite.name,
            customerName: northshoreCustomer.name,
            scheduledDate: new Date("2026-03-16T08:00:00-05:00").toISOString(),
            assetCount: 1,
            priorReportSummary: ""
          }
        }
      }
    }]
  });

  void northshoreCustomerUser;
  await prisma.auditLog.createMany({
    data: [
      { tenantId: tenant.id, actorUserId: officeAdmin.id, action: "inspection.created", entityType: "Inspection", entityId: "seeded", metadata: { count: inspections.length } },
      { actorUserId: platformAdmin.id, action: "tenant.seeded", entityType: "Tenant", entityId: tenant.id, metadata: { slug: tenant.slug } },
      { tenantId: tenant.id, actorUserId: customer1.id, action: "customer.portal_access_granted", entityType: "CustomerCompany", entityId: pinecrest.id }
    ]
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
