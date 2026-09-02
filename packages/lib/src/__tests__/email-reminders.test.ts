import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  customerCompany: {
    findMany: vi.fn()
  },
  inspectionTask: {
    findMany: vi.fn()
  },
  emailReminderSendLog: {
    findMany: vi.fn(),
    createMany: vi.fn()
  },
  tenant: {
    findFirst: vi.fn()
  },
  auditLog: {
    create: vi.fn()
  }
};

const sendCustomerBrandedEmailMock = vi.fn();

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

vi.mock("../account-email", () => ({
  sendCustomerBrandedEmail: sendCustomerBrandedEmailMock
}));

describe("email reminders", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("merges reminder templates without leaving unresolved placeholders", async () => {
    const { mergeEmailReminderTemplate } = await import("../email-reminders");

    const merged = mergeEmailReminderTemplate(
      "Hello {{customerName}},\n\nCall {{companyPhone}}\n{{companyEmail}}",
      {
        customerName: "",
        companyName: "Northwest Fire",
        companyPhone: "580-540-3119",
        companyEmail: "hello@example.com"
      }
    );

    expect(merged).toContain("Hello,");
    expect(merged).toContain("580-540-3119");
    expect(merged).toContain("hello@example.com");
    expect(merged).not.toContain("{{");
  });

  it("returns customer-level reminder candidates with recent send state", async () => {
    prismaMock.customerCompany.findMany.mockResolvedValue([
      {
        id: "customer_1",
        name: "Klemme Construction",
        contactName: "Brett Klemme",
        billingEmail: "office@klemme.com",
        phone: "555-1111",
        serviceAddressLine1: "123 Main St",
        serviceCity: "Tulsa",
        serviceState: "OK",
        servicePostalCode: "74101",
        billingAddressLine1: "123 Main St",
        billingCity: "Tulsa",
        billingState: "OK",
        billingPostalCode: "74101",
        sites: [
          {
            id: "site_1",
            name: "Main Campus",
            addressLine1: "123 Main St",
            city: "Tulsa",
            state: "OK",
            postalCode: "74101"
          }
        ]
      }
    ]);
    prismaMock.inspectionTask.findMany.mockResolvedValue([
      {
        id: "task_1",
        inspectionType: "fire_alarm",
        inspection: {
          id: "inspection_1",
          customerCompanyId: "customer_1",
          customerCompany: {
            id: "customer_1",
            name: "Klemme Construction",
            contactName: "Brett Klemme",
            billingEmail: "office@klemme.com"
          },
          site: {
            id: "site_1",
            name: "Main Campus",
            city: "Tulsa",
            addressLine1: "123 Main St"
          }
        }
      },
      {
        id: "task_2",
        inspectionType: "kitchen_suppression",
        inspection: {
          id: "inspection_2",
          customerCompanyId: "customer_1",
          customerCompany: {
            id: "customer_1",
            name: "Klemme Construction",
            contactName: "Brett Klemme",
            billingEmail: "office@klemme.com"
          },
          site: {
            id: "site_2",
            name: "South Kitchen",
            city: "Tulsa",
            addressLine1: "456 Elm St"
          }
        }
      }
    ]);
    prismaMock.emailReminderSendLog.findMany
      .mockResolvedValueOnce([
        {
          customerCompanyId: "customer_1",
          sentAt: new Date("2026-04-10T15:00:00.000Z")
        }
      ])
      .mockResolvedValueOnce([]);
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      name: "Northwest Fire & Safety",
      billingEmail: "billing@nwfireandsafety.com",
      branding: {
        legalBusinessName: "Northwest Fire & Safety",
        phone: "580-540-3119",
        email: "accounting@nwfireandsafety.com"
      }
    });

    const { getEmailReminderWorkspaceData } = await import("../email-reminders");
    const result = await getEmailReminderWorkspaceData(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { dueMonth: "2026-04", query: "klemme" }
    );

    expect(result.summary.candidateCount).toBe(1);
    expect(result.recipients[0]?.customerName).toBe("Klemme Construction");
    expect(result.recipients[0]?.inspectionTypeLabels).toEqual(["Fire alarm", "Kitchen suppression"]);
    expect(result.recipients[0]?.lastSentAt).toBe("2026-04-10T15:00:00.000Z");
  });

  it("defaults the recipient customer list to customers with prior email activity", async () => {
    prismaMock.customerCompany.findMany.mockResolvedValue([
      {
        id: "customer_sent",
        name: "Previously Emailed Customer",
        contactName: "Pat Recipient",
        billingEmail: "pat@example.test",
        phone: "555-1111",
        serviceAddressLine1: "100 Sent Ave",
        serviceCity: "Enid",
        serviceState: "OK",
        servicePostalCode: "73701",
        billingAddressLine1: "100 Sent Ave",
        billingCity: "Enid",
        billingState: "OK",
        billingPostalCode: "73701",
        sites: []
      }
    ]);
    prismaMock.inspectionTask.findMany.mockResolvedValue([]);
    prismaMock.emailReminderSendLog.findMany
      .mockResolvedValueOnce([
        { customerCompanyId: "customer_sent" },
        { customerCompanyId: "customer_sent" }
      ])
      .mockResolvedValueOnce([
        {
          customerCompanyId: "customer_sent",
          sentAt: new Date("2026-05-10T15:00:00.000Z")
        }
      ])
      .mockResolvedValueOnce([]);
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      name: "Northwest Fire & Safety",
      billingEmail: "billing@nwfireandsafety.com",
      branding: {
        legalBusinessName: "Northwest Fire & Safety",
        phone: "580-540-3119",
        email: "accounting@nwfireandsafety.com"
      }
    });

    const { getEmailReminderWorkspaceData } = await import("../email-reminders");
    const result = await getEmailReminderWorkspaceData(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { dueMonth: "2026-07" }
    );

    expect(prismaMock.customerCompany.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { tenantId: "tenant_1" },
            { id: { in: ["customer_sent"] } }
          ])
        })
      })
    );
    expect(result.recipients).toHaveLength(1);
    expect(result.recipients[0]?.customerName).toBe("Previously Emailed Customer");
    expect(result.recipients[0]?.lastSentAt).toBe("2026-05-10T15:00:00.000Z");
  });

  it("exposes active customers with listed emails for blast notice selection", async () => {
    prismaMock.customerCompany.findMany
      .mockResolvedValueOnce([
        {
          id: "customer_sent",
          name: "Previously Emailed Customer",
          contactName: "Pat Recipient",
          billingEmail: "pat@example.test",
          contactEmails: null,
          phone: "555-1111",
          isActive: true,
          serviceAddressLine1: "100 Sent Ave",
          serviceCity: "Enid",
          serviceState: "OK",
          servicePostalCode: "73701",
          billingAddressLine1: "100 Sent Ave",
          billingCity: "Enid",
          billingState: "OK",
          billingPostalCode: "73701",
          sites: []
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "customer_active_email",
          name: "Active Email Customer",
          contactName: "Alex Recipient",
          billingEmail: "alex@example.test",
          contactEmails: null,
          phone: "555-2222",
          isActive: true,
          serviceAddressLine1: "200 Active Ave",
          serviceCity: "Enid",
          serviceState: "OK",
          servicePostalCode: "73701",
          billingAddressLine1: "200 Active Ave",
          billingCity: "Enid",
          billingState: "OK",
          billingPostalCode: "73701",
          sites: []
        }
      ]);
    prismaMock.inspectionTask.findMany.mockResolvedValue([]);
    prismaMock.emailReminderSendLog.findMany
      .mockResolvedValueOnce([{ customerCompanyId: "customer_sent" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          customerCompanyId: "customer_active_email",
          templateKey: "pye_barker_acquisition_announcement"
        }
      ]);
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      name: "Northwest Fire & Safety",
      billingEmail: "billing@nwfireandsafety.com",
      branding: {
        legalBusinessName: "Northwest Fire & Safety",
        phone: "580-540-3119",
        email: "accounting@nwfireandsafety.com"
      }
    });

    const { getEmailReminderWorkspaceData } = await import("../email-reminders");
    const result = await getEmailReminderWorkspaceData(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { dueMonth: "2026-07" }
    );

    expect(prismaMock.customerCompany.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { tenantId: "tenant_1" },
            { isActive: true },
            {
              OR: [
                { contactEmails: { not: null } },
                { billingEmail: { not: null } }
              ]
            },
            {
              NOT: {
                AND: [
                  { OR: [{ contactEmails: null }, { contactEmails: "" }] },
                  { OR: [{ billingEmail: null }, { billingEmail: "" }] }
                ]
              }
            }
          ])
        })
      })
    );
    expect(result.blastEligibleRecipients).toEqual([
      {
        customerCompanyId: "customer_active_email",
        customerName: "Active Email Customer",
        recipientEmail: "alex@example.test",
        hasValidEmail: true,
        successfulTemplateKeys: ["pye_barker_acquisition_announcement"]
      }
    ]);
  });

  it("uses contact email first and falls back to billing email for blast recipients", async () => {
    prismaMock.customerCompany.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "customer_contact",
          name: "Contact Email Customer",
          contactName: "Casey Contact",
          contactEmails: "casey@example.test",
          billingEmail: "billing-contact@example.test",
          phone: "555-3333",
          isActive: true,
          serviceAddressLine1: "300 Contact Ave",
          serviceCity: "Enid",
          serviceState: "OK",
          servicePostalCode: "73701",
          billingAddressLine1: "300 Contact Ave",
          billingCity: "Enid",
          billingState: "OK",
          billingPostalCode: "73701",
          sites: []
        },
        {
          id: "customer_billing",
          name: "Billing Fallback Customer",
          contactName: "Bailey Billing",
          contactEmails: null,
          billingEmail: "billing-fallback@example.test",
          phone: "555-4444",
          isActive: true,
          serviceAddressLine1: "400 Billing Ave",
          serviceCity: "Enid",
          serviceState: "OK",
          servicePostalCode: "73701",
          billingAddressLine1: "400 Billing Ave",
          billingCity: "Enid",
          billingState: "OK",
          billingPostalCode: "73701",
          sites: []
        },
        {
          id: "customer_missing",
          name: "No Email Customer",
          contactName: "No Email",
          contactEmails: null,
          billingEmail: null,
          phone: "555-5555",
          isActive: true,
          serviceAddressLine1: "500 Missing Ave",
          serviceCity: "Enid",
          serviceState: "OK",
          servicePostalCode: "73701",
          billingAddressLine1: "500 Missing Ave",
          billingCity: "Enid",
          billingState: "OK",
          billingPostalCode: "73701",
          sites: []
        }
      ]);
    prismaMock.inspectionTask.findMany.mockResolvedValue([]);
    prismaMock.emailReminderSendLog.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      name: "Northwest Fire & Safety",
      billingEmail: "billing@nwfireandsafety.com",
      branding: {
        legalBusinessName: "Northwest Fire & Safety",
        phone: "580-540-3119",
        email: "accounting@nwfireandsafety.com"
      }
    });

    const { getEmailReminderWorkspaceData } = await import("../email-reminders");
    const result = await getEmailReminderWorkspaceData(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { dueMonth: "2026-07", query: "customer" }
    );

    expect(result.blastEligibleRecipients).toEqual([
      {
        customerCompanyId: "customer_contact",
        customerName: "Contact Email Customer",
        recipientEmail: "casey@example.test",
        hasValidEmail: true,
        successfulTemplateKeys: []
      },
      {
        customerCompanyId: "customer_billing",
        customerName: "Billing Fallback Customer",
        recipientEmail: "billing-fallback@example.test",
        hasValidEmail: true,
        successfulTemplateKeys: []
      }
    ]);
  });

  it("uses the customer address when site context is empty", async () => {
    prismaMock.customerCompany.findMany.mockResolvedValue([
      {
        id: "customer_1",
        name: "Acme Tower",
        contactName: "Jordan Lee",
        billingEmail: "billing@acme.test",
        phone: "555-1111",
        serviceAddressLine1: "500 Service Ave",
        serviceCity: "Tulsa",
        serviceState: "OK",
        servicePostalCode: "74103",
        billingAddressLine1: "PO Box 12",
        billingCity: "Tulsa",
        billingState: "OK",
        billingPostalCode: "74101",
        sites: []
      }
    ]);
    prismaMock.inspectionTask.findMany.mockResolvedValue([
      {
        id: "task_1",
        inspectionType: "fire_alarm",
        inspection: {
          id: "inspection_1",
          customerCompanyId: "customer_1",
          customerCompany: {
            id: "customer_1",
            name: "Acme Tower",
            contactName: "Jordan Lee",
            billingEmail: "billing@acme.test",
            serviceAddressLine1: "500 Service Ave",
            serviceCity: "Tulsa",
            serviceState: "OK",
            servicePostalCode: "74103",
            billingAddressLine1: "PO Box 12",
            billingCity: "Tulsa",
            billingState: "OK",
            billingPostalCode: "74101"
          },
          site: {
            id: "site_1",
            name: "",
            city: null,
            addressLine1: null
          }
        }
      }
    ]);
    prismaMock.emailReminderSendLog.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      name: "Northwest Fire & Safety",
      billingEmail: "billing@nwfireandsafety.com",
      branding: {
        legalBusinessName: "Northwest Fire & Safety",
        phone: "580-540-3119",
        email: "accounting@nwfireandsafety.com"
      }
    });

    const { getEmailReminderWorkspaceData } = await import("../email-reminders");
    const result = await getEmailReminderWorkspaceData(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { dueMonth: "2026-04", query: "acme" }
    );

    expect(result.recipients[0]?.siteSummary).toBe("500 Service Ave, Tulsa OK 74103");
  });

  it("sends merged reminder emails and stores snapshots in the send log", async () => {
    prismaMock.customerCompany.findMany.mockResolvedValue([
      {
        id: "customer_1",
        name: "Klemme Construction",
        contactName: "Brett Klemme",
        billingEmail: "office@klemme.com",
        phone: "555-1111",
        serviceAddressLine1: "123 Main St",
        serviceCity: "Tulsa",
        serviceState: "OK",
        servicePostalCode: "74101",
        billingAddressLine1: "123 Main St",
        billingCity: "Tulsa",
        billingState: "OK",
        billingPostalCode: "74101",
        sites: [
          {
            id: "site_1",
            name: "Main Campus",
            addressLine1: "123 Main St",
            city: "Tulsa",
            state: "OK",
            postalCode: "74101"
          }
        ]
      }
    ]);
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      name: "Northwest Fire & Safety",
      billingEmail: "billing@nwfireandsafety.com",
      branding: {
        legalBusinessName: "Northwest Fire & Safety",
        phone: "580-540-3119",
        email: "accounting@nwfireandsafety.com"
      }
    });
    prismaMock.inspectionTask.findMany.mockResolvedValue([
      {
        id: "task_1",
        inspectionType: "fire_alarm",
        inspection: {
          id: "inspection_1",
          customerCompanyId: "customer_1",
          customerCompany: {
            id: "customer_1",
            name: "Klemme Construction",
            contactName: "Brett Klemme",
            billingEmail: "office@klemme.com"
          },
          site: {
            id: "site_1",
            name: "Main Campus",
            city: "Tulsa",
            addressLine1: "123 Main St"
          }
        }
      }
    ]);
    sendCustomerBrandedEmailMock.mockResolvedValue({
      sent: true,
      provider: "resend",
      messageId: "msg_1",
      error: null,
      reason: "sent"
    });

    const { sendManualEmailReminders } = await import("../email-reminders");
    const result = await sendManualEmailReminders(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        dueMonth: "2026-04",
        customerCompanyIds: ["customer_1"],
        templateKey: "inspection_due_this_month",
        subject: "Your Fire Inspection Is Due This Month",
        body: "Hello {{customerName}},\n\nPlease contact {{companyName}} at {{companyPhone}}."
      }
    );

    expect(result.sentCount).toBe(1);
    expect(sendCustomerBrandedEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      recipientEmail: "office@klemme.com",
      subjectLine: "Your Fire Inspection Is Due This Month"
    }));
    expect(prismaMock.emailReminderSendLog.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [
        expect.objectContaining({
          customerCompanyId: "customer_1",
          subjectSnapshot: "Your Fire Inspection Is Due This Month"
        })
      ]
    }));
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });

  it("retries customer email blasts once when the provider rate limits a send", async () => {
    prismaMock.customerCompany.findMany.mockResolvedValue([
      {
        id: "customer_1",
        name: "Zoe Bible Church",
        contactName: "Zoe Admin",
        contactEmails: null,
        billingEmail: "zbc729@faithingod.com",
        phone: "555-1111",
        serviceAddressLine1: "123 Main St",
        serviceCity: "Tulsa",
        serviceState: "OK",
        servicePostalCode: "74101",
        billingAddressLine1: "123 Main St",
        billingCity: "Tulsa",
        billingState: "OK",
        billingPostalCode: "74101",
        sites: []
      }
    ]);
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      name: "Northwest Fire & Safety",
      billingEmail: "billing@nwfireandsafety.com",
      branding: {
        legalBusinessName: "Northwest Fire & Safety",
        phone: "580-540-3119",
        email: "accounting@nwfireandsafety.com"
      }
    });
    prismaMock.inspectionTask.findMany.mockResolvedValue([]);
    sendCustomerBrandedEmailMock
      .mockResolvedValueOnce({
        sent: false,
        provider: "resend",
        messageId: null,
        error: "Too many requests. You can only make 10 requests per second.",
        reason: "provider_error"
      })
      .mockResolvedValueOnce({
        sent: true,
        provider: "resend",
        messageId: "msg_retry",
        error: null,
        reason: "sent"
      });

    const { sendManualEmailReminders } = await import("../email-reminders");
    const result = await sendManualEmailReminders(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        dueMonth: "2026-08",
        customerCompanyIds: ["customer_1"],
        templateKey: "pye_barker_acquisition_announcement",
        subject: "Northwest Fire & Safety Has Joined Pye-Barker Fire & Safety",
        body: "Hello {{customerName}},\n\nNorthwest Fire & Safety has joined Pye-Barker Fire & Safety."
      }
    );

    expect(result.sentCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(sendCustomerBrandedEmailMock).toHaveBeenCalledTimes(2);
    expect(prismaMock.emailReminderSendLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            customerCompanyId: "customer_1",
            messageId: "msg_retry",
            providerReason: "sent",
            providerError: null
          })
        ]
      })
    );
  });

  it("uses a one-off recipient email override without changing the customer file", async () => {
    prismaMock.customerCompany.findMany.mockResolvedValue([
      {
        id: "customer_1",
        name: "Klemme Construction",
        contactName: "Brett Klemme",
        billingEmail: "office@klemme.com",
        phone: "555-1111",
        serviceAddressLine1: "123 Main St",
        serviceCity: "Tulsa",
        serviceState: "OK",
        servicePostalCode: "74101",
        billingAddressLine1: "123 Main St",
        billingCity: "Tulsa",
        billingState: "OK",
        billingPostalCode: "74101",
        sites: []
      }
    ]);
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      name: "Northwest Fire & Safety",
      billingEmail: "billing@nwfireandsafety.com",
      branding: {
        legalBusinessName: "Northwest Fire & Safety",
        phone: "580-540-3119",
        email: "accounting@nwfireandsafety.com"
      }
    });
    prismaMock.inspectionTask.findMany.mockResolvedValue([]);
    sendCustomerBrandedEmailMock.mockResolvedValue({
      sent: true,
      provider: "resend",
      messageId: "msg_override",
      error: null,
      reason: "sent"
    });

    const { sendManualEmailReminders } = await import("../email-reminders");
    const result = await sendManualEmailReminders(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        dueMonth: "2026-04",
        customerCompanyIds: ["customer_1"],
        recipientEmailOverrides: { customer_1: "alternate@example.com" },
        templateKey: "inspection_due_this_month",
        subject: "Your Fire Inspection Is Due This Month",
        body: "Hello {{customerName}},\n\nPlease contact {{companyName}}."
      }
    );

    expect(result.sentCount).toBe(1);
    expect(sendCustomerBrandedEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: "alternate@example.com" })
    );
    expect(prismaMock.emailReminderSendLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            customerCompanyId: "customer_1",
            recipientEmail: "alternate@example.com"
          })
        ]
      })
    );
    expect(prismaMock.customerCompany.findMany).toHaveBeenCalled();
  });

  it("allows manual sends for customers without due task matches", async () => {
    prismaMock.customerCompany.findMany.mockResolvedValue([
      {
        id: "customer_2",
        name: "Walk-In Client",
        contactName: null,
        billingEmail: "hello@walkin.test",
        phone: null,
        serviceAddressLine1: "88 Main St",
        serviceCity: "Tulsa",
        serviceState: "OK",
        servicePostalCode: "74102",
        billingAddressLine1: "88 Main St",
        billingCity: "Tulsa",
        billingState: "OK",
        billingPostalCode: "74102",
        sites: []
      }
    ]);
    prismaMock.inspectionTask.findMany.mockResolvedValue([]);
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      name: "Northwest Fire & Safety",
      billingEmail: "billing@nwfireandsafety.com",
      branding: {
        legalBusinessName: "Northwest Fire & Safety",
        phone: "580-540-3119",
        email: "accounting@nwfireandsafety.com"
      }
    });
    sendCustomerBrandedEmailMock.mockResolvedValue({
      sent: true,
      provider: "resend",
      messageId: "msg_2",
      error: null,
      reason: "sent"
    });

    const { sendManualEmailReminders } = await import("../email-reminders");
    const result = await sendManualEmailReminders(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        dueMonth: "2026-04",
        customerCompanyIds: ["customer_2"],
        templateKey: "inspection_due_this_month",
        subject: "Your Fire Inspection Is Due This Month",
        body: "Hello {{customerName}},\n\nWe will reach out soon."
      }
    );

    expect(result.sentCount).toBe(1);
    expect(sendCustomerBrandedEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: "hello@walkin.test" })
    );
  });

  it("supports the customer welcome template with branded sends and clean logging", async () => {
    prismaMock.customerCompany.findMany.mockResolvedValue([
      {
        id: "customer_3",
        name: "Baptist Village",
        contactName: "Holly Rider",
        billingEmail: "hrider@baptistvillage.org",
        phone: "580-249-2600",
        serviceAddressLine1: "300 Baptist Village Dr",
        serviceCity: "Enid",
        serviceState: "OK",
        servicePostalCode: "73703",
        billingAddressLine1: "300 Baptist Village Dr",
        billingCity: "Enid",
        billingState: "OK",
        billingPostalCode: "73703",
        sites: []
      }
    ]);
    prismaMock.inspectionTask.findMany.mockResolvedValue([]);
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      name: "Northwest Fire & Safety",
      billingEmail: "billing@nwfireandsafety.com",
      branding: {
        legalBusinessName: "Northwest Fire & Safety",
        phone: "580-540-3119",
        email: "accounting@nwfireandsafety.com"
      }
    });
    sendCustomerBrandedEmailMock.mockResolvedValue({
      sent: true,
      provider: "resend",
      messageId: "msg_welcome",
      error: null,
      reason: "sent"
    });
    prismaMock.emailReminderSendLog.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const { getEmailReminderWorkspaceData, sendManualEmailReminders } = await import("../email-reminders");
    const workspace = await getEmailReminderWorkspaceData(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { dueMonth: "2026-04", customerCompanyIds: ["customer_3"] }
    );

    expect(workspace.templates.map((template) => template.key)).toContain("customer_welcome");

    const result = await sendManualEmailReminders(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        dueMonth: "2026-04",
        customerCompanyIds: ["customer_3"],
        templateKey: "customer_welcome",
        subject: "Welcome to {{companyName}}",
        body: "Hello {{customerName}},\n\nReach us at {{companyPhone}} or {{companyEmail}}."
      }
    );

    expect(result.templateLabel).toBe("welcome email");
    expect(sendCustomerBrandedEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: "hrider@baptistvillage.org",
        eyebrow: "Customer welcome",
        subjectLine: "Welcome to Northwest Fire & Safety",
        title: "Welcome to Northwest Fire & Safety"
      })
    );
    expect(prismaMock.emailReminderSendLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            templateKey: "customer_welcome",
            dueMonth: null,
            siteSummary: null,
            inspectionTypes: [],
            divisions: []
          })
        ]
      })
    );
  });

  it("sends the Pye-Barker acquisition announcement without scheduling requirements", async () => {
    prismaMock.customerCompany.findMany.mockResolvedValue([
      {
        id: "customer_announcement",
        name: "Black Forest Decor",
        contactName: "Mark Black",
        billingEmail: "mark@blackforestdecor.com",
        phone: "580-555-0199",
        serviceAddressLine1: "2717 N Van Buren St",
        serviceCity: "Enid",
        serviceState: "OK",
        servicePostalCode: "73703",
        billingAddressLine1: "2717 N Van Buren St",
        billingCity: "Enid",
        billingState: "OK",
        billingPostalCode: "73703",
        sites: []
      }
    ]);
    prismaMock.inspectionTask.findMany.mockResolvedValue([]);
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      name: "Northwest Fire & Safety",
      billingEmail: "billing@nwfireandsafety.com",
      branding: {
        legalBusinessName: "Northwest Fire & Safety",
        phone: "580-540-3119",
        email: "accounting@nwfireandsafety.com"
      }
    });
    sendCustomerBrandedEmailMock.mockResolvedValue({
      sent: true,
      provider: "resend",
      messageId: "msg_announcement",
      error: null,
      reason: "sent"
    });
    prismaMock.emailReminderSendLog.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const { getEmailReminderWorkspaceData, sendManualEmailReminders } = await import("../email-reminders");
    const workspace = await getEmailReminderWorkspaceData(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { dueMonth: "2026-04", customerCompanyIds: ["customer_announcement"] }
    );
    const announcementTemplate = workspace.templates.find((template) => template.key === "pye_barker_acquisition_announcement");

    expect(announcementTemplate).toEqual(
      expect.objectContaining({
        label: "Pye-Barker Acquisition Announcement",
        category: "announcement"
      })
    );

    const result = await sendManualEmailReminders(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        dueMonth: "2026-04",
        customerCompanyIds: ["customer_announcement"],
        templateKey: "pye_barker_acquisition_announcement",
        subject: announcementTemplate?.subject ?? "",
        body: announcementTemplate?.body ?? ""
      }
    );

    expect(result.templateLabel).toBe("announcement email");
    expect(sendCustomerBrandedEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: "mark@blackforestdecor.com",
        eyebrow: "Company update",
        subjectLine: "Northwest Fire & Safety Has Joined Pye-Barker Fire & Safety",
        title: "Northwest Fire & Safety has joined Pye-Barker Fire & Safety",
        bodyText: expect.stringContaining("same exceptional service")
      })
    );
    expect(prismaMock.emailReminderSendLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            templateKey: "pye_barker_acquisition_announcement",
            dueMonth: null,
            siteSummary: null,
            inspectionTypes: [],
            divisions: []
          })
        ]
      })
    );
  });

  it("sends service scheduling emails with selected date, time, and service types", async () => {
    prismaMock.customerCompany.findMany.mockResolvedValue([
      {
        id: "customer_4",
        name: "St. Mary's Rehab",
        contactName: "Sam Coordinator",
        billingEmail: "maintenance@stmarys.test",
        phone: "580-555-0100",
        serviceAddressLine1: "100 Care Ave",
        serviceCity: "Enid",
        serviceState: "OK",
        servicePostalCode: "73701",
        billingAddressLine1: "100 Care Ave",
        billingCity: "Enid",
        billingState: "OK",
        billingPostalCode: "73701",
        sites: []
      }
    ]);
    prismaMock.inspectionTask.findMany.mockResolvedValue([]);
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      name: "Northwest Fire & Safety",
      billingEmail: "billing@nwfireandsafety.com",
      branding: {
        legalBusinessName: "Northwest Fire & Safety",
        phone: "580-540-3119",
        email: "accounting@nwfireandsafety.com"
      }
    });
    sendCustomerBrandedEmailMock.mockResolvedValue({
      sent: true,
      provider: "resend",
      messageId: "msg_schedule",
      error: null,
      reason: "sent"
    });

    const { getEmailReminderWorkspaceData, sendManualEmailReminders } = await import("../email-reminders");
    prismaMock.emailReminderSendLog.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const workspace = await getEmailReminderWorkspaceData(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { dueMonth: "2026-04", customerCompanyIds: ["customer_4"] }
    );

    expect(workspace.templates.map((template) => template.key)).toContain("service_inspection_scheduling");
    expect(workspace.options.serviceTypes.length).toBeGreaterThan(0);

    const result = await sendManualEmailReminders(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        dueMonth: "2026-04",
        customerCompanyIds: ["customer_4"],
        templateKey: "service_inspection_scheduling",
        subject: "Service Scheduled for {{serviceDate}} at {{serviceTime}}",
        body: "Hello {{customerName}},\n\n{{serviceTypes}}\n\nScheduled for {{serviceDate}} at {{serviceTime}}.",
        schedulingDetails: {
          serviceDate: "2026-07-21",
          serviceTime: "13:30",
          serviceTypes: ["Fire Alarm", "Custom pump test"]
        }
      }
    );

    expect(result.templateLabel).toBe("scheduling email");
    expect(sendCustomerBrandedEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: "maintenance@stmarys.test",
        eyebrow: "Service scheduling",
        subjectLine: "Service Scheduled for Tuesday, July 21, 2026 at 1:30 PM",
        bodyText: expect.stringContaining("- Fire Alarm")
      })
    );
    expect(sendCustomerBrandedEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyText: expect.stringContaining("- Custom pump test")
      })
    );
    expect(prismaMock.emailReminderSendLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            templateKey: "service_inspection_scheduling",
            dueMonth: null,
            bodySnapshot: expect.stringContaining("Tuesday, July 21, 2026")
          })
        ]
      })
    );
  });
});
