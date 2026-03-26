import { prisma } from "@testworx/db";
import { z } from "zod";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { assertTenantContext } from "./permissions";
import { getTenantQuickBooksConnectionStatus, syncTradeWorxCustomerCompanyToQuickBooks } from "./quickbooks";

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function ensureTenantAdmin(parsedActor: ReturnType<typeof parseActor>) {
  if (!["tenant_admin", "platform_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can manage customers.");
  }
}

function nullableTrimmedString(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);
}

export const customerCompanyInputSchema = z.object({
  customerCompanyId: z.string().trim().optional(),
  name: z.string().trim().min(1, "Customer name is required.").max(160),
  contactName: nullableTrimmedString(160),
  billingEmail: z
    .string()
    .trim()
    .email("Enter a valid billing email.")
    .or(z.literal(""))
    .optional()
    .transform((value) => value || undefined),
  phone: nullableTrimmedString(60)
});

type CustomerCompanySyncResult = {
  customer: {
    id: string;
    name: string;
    contactName: string | null;
    billingEmail: string | null;
    phone: string | null;
    quickbooksCustomerId: string | null;
  };
  quickBooksSyncError: string | null;
  quickBooksSynced: boolean;
};

export async function getTenantCustomerCompanySettings(actor: ActorContext) {
  const result = await getPaginatedTenantCustomerCompanySettings(actor, { page: 1, limit: 5000 });
  return result.customers;
}

export async function getPaginatedTenantCustomerCompanySettings(
  actor: ActorContext,
  input?: {
    page?: number;
    limit?: number;
  }
) {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);
  const page = Math.max(input?.page ?? 1, 1);
  const limit = Math.min(Math.max(input?.limit ?? 10, 1), 100);
  const tenantId = parsedActor.tenantId as string;

  const [totalCount, customers] = await Promise.all([
    prisma.customerCompany.count({
      where: { tenantId }
    }),
    prisma.customerCompany.findMany({
      where: { tenantId },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        contactName: true,
        billingEmail: true,
        phone: true,
        quickbooksCustomerId: true,
        createdAt: true,
        updatedAt: true
      }
    })
  ]);

  const totalPages = Math.max(Math.ceil(totalCount / limit), 1);
  const safePage = Math.min(page, totalPages);
  const pagedCustomers = safePage === page
    ? customers
    : await prisma.customerCompany.findMany({
        where: { tenantId },
        orderBy: [{ name: "asc" }, { createdAt: "asc" }],
        skip: (safePage - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          contactName: true,
          billingEmail: true,
          phone: true,
          quickbooksCustomerId: true,
          createdAt: true,
          updatedAt: true
        }
      });

  return {
    customers: pagedCustomers,
    pagination: {
      page: safePage,
      limit,
      totalCount,
      totalPages
    }
  };
}

async function syncCustomerCompanyIfQuickBooksConnected(actor: ActorContext, customerCompanyId: string) {
  try {
    const status = await getTenantQuickBooksConnectionStatus(actor);
    if (!status.connection.connected) {
      return { quickBooksSynced: false, quickBooksSyncError: null };
    }

    await syncTradeWorxCustomerCompanyToQuickBooks(actor, customerCompanyId);
    return { quickBooksSynced: true, quickBooksSyncError: null };
  } catch (error) {
    return {
      quickBooksSynced: false,
      quickBooksSyncError: error instanceof Error ? error.message : "QuickBooks customer sync failed."
    };
  }
}

export async function createCustomerCompany(actor: ActorContext, input: z.infer<typeof customerCompanyInputSchema>): Promise<CustomerCompanySyncResult> {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);
  const parsedInput = customerCompanyInputSchema.parse(input);

  const existing = await prisma.customerCompany.findFirst({
    where: {
      tenantId: parsedActor.tenantId as string,
      name: parsedInput.name
    },
    select: { id: true }
  });

  if (existing) {
    throw new Error("A customer with that name already exists.");
  }

  const customer = await prisma.customerCompany.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      name: parsedInput.name,
      contactName: parsedInput.contactName ?? null,
      billingEmail: parsedInput.billingEmail ?? null,
      phone: parsedInput.phone ?? null
    },
    select: {
      id: true,
      name: true,
      contactName: true,
      billingEmail: true,
      phone: true,
      quickbooksCustomerId: true
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "customer.company_created",
      entityType: "CustomerCompany",
      entityId: customer.id,
      metadata: {
        name: customer.name,
        billingEmail: customer.billingEmail,
        phone: customer.phone
      }
    }
  });

  const syncResult = await syncCustomerCompanyIfQuickBooksConnected(parsedActor, customer.id);
  const refreshedCustomer = syncResult.quickBooksSynced
    ? await prisma.customerCompany.findFirst({
        where: {
          id: customer.id,
          tenantId: parsedActor.tenantId as string
        },
        select: {
          id: true,
          name: true,
          contactName: true,
          billingEmail: true,
          phone: true,
          quickbooksCustomerId: true
        }
      })
    : customer;

  return {
    customer: refreshedCustomer ?? customer,
    ...syncResult
  };
}

export async function updateCustomerCompany(actor: ActorContext, input: z.infer<typeof customerCompanyInputSchema>): Promise<CustomerCompanySyncResult> {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);
  const parsedInput = customerCompanyInputSchema.parse(input);

  if (!parsedInput.customerCompanyId) {
    throw new Error("A customer id is required to update a customer.");
  }

  const existing = await prisma.customerCompany.findFirst({
    where: {
      id: parsedInput.customerCompanyId,
      tenantId: parsedActor.tenantId as string
    },
    select: {
      id: true,
      name: true
    }
  });

  if (!existing) {
    throw new Error("Customer not found.");
  }

  const nameConflict = await prisma.customerCompany.findFirst({
    where: {
      tenantId: parsedActor.tenantId as string,
      name: parsedInput.name,
      NOT: { id: existing.id }
    },
    select: { id: true }
  });

  if (nameConflict) {
    throw new Error("Another customer already uses that name.");
  }

  const customer = await prisma.customerCompany.update({
    where: { id: existing.id },
    data: {
      name: parsedInput.name,
      contactName: parsedInput.contactName ?? null,
      billingEmail: parsedInput.billingEmail ?? null,
      phone: parsedInput.phone ?? null
    },
    select: {
      id: true,
      name: true,
      contactName: true,
      billingEmail: true,
      phone: true,
      quickbooksCustomerId: true
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "customer.company_updated",
      entityType: "CustomerCompany",
      entityId: customer.id,
      metadata: {
        name: customer.name,
        billingEmail: customer.billingEmail,
        phone: customer.phone
      }
    }
  });

  const syncResult = await syncCustomerCompanyIfQuickBooksConnected(parsedActor, customer.id);
  const refreshedCustomer = syncResult.quickBooksSynced
    ? await prisma.customerCompany.findFirst({
        where: {
          id: customer.id,
          tenantId: parsedActor.tenantId as string
        },
        select: {
          id: true,
          name: true,
          contactName: true,
          billingEmail: true,
          phone: true,
          quickbooksCustomerId: true
        }
      })
    : customer;

  return {
    customer: refreshedCustomer ?? customer,
    ...syncResult
  };
}
