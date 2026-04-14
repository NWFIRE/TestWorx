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
      { dueMonth: "2026-04" }
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
      { dueMonth: "2026-04" }
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
});
