import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function ensureBillingPlans() {
  const [starterPlan, professionalPlan] = await Promise.all([
    prisma.subscriptionPlan.upsert({
      where: { code: "starter" },
      update: {
        name: "Starter",
        monthlyPriceCents: 19900,
        maxUsers: 12,
        featureFlags: { customerPortal: true, reportDrafts: true, advancedRecurrence: false, uploadedInspectionPdfs: false }
      },
      create: {
        code: "starter",
        name: "Starter",
        monthlyPriceCents: 19900,
        maxUsers: 12,
        featureFlags: { customerPortal: true, reportDrafts: true, advancedRecurrence: false, uploadedInspectionPdfs: false }
      }
    }),
    prisma.subscriptionPlan.upsert({
      where: { code: "professional" },
      update: {
        name: "Professional",
        monthlyPriceCents: 49900,
        maxUsers: 50,
        featureFlags: { customerPortal: true, reportDrafts: true, brandedPdf: true, advancedRecurrence: true, uploadedInspectionPdfs: true }
      },
      create: {
        code: "professional",
        name: "Professional",
        monthlyPriceCents: 49900,
        maxUsers: 50,
        featureFlags: { customerPortal: true, reportDrafts: true, brandedPdf: true, advancedRecurrence: true, uploadedInspectionPdfs: true }
      }
    })
  ]);

  await prisma.subscriptionPlan.upsert({
    where: { code: "enterprise" },
    update: {
      name: "Enterprise",
      monthlyPriceCents: 99900,
      maxUsers: 250,
      featureFlags: { customerPortal: true, reportDrafts: true, brandedPdf: true, premiumSupport: true, advancedRecurrence: true, uploadedInspectionPdfs: true }
    },
    create: {
      code: "enterprise",
      name: "Enterprise",
      monthlyPriceCents: 99900,
      maxUsers: 250,
      featureFlags: { customerPortal: true, reportDrafts: true, brandedPdf: true, premiumSupport: true, advancedRecurrence: true, uploadedInspectionPdfs: true }
    }
  });

  void starterPlan;
  return { professionalPlan };
}

type OptionalBootstrapEnv = {
  PILOT_TIMEZONE?: string;
  PILOT_BILLING_EMAIL?: string;
  PILOT_CUSTOMER_COMPANY_NAME?: string;
  PILOT_CUSTOMER_CONTACT_NAME?: string;
  PILOT_CUSTOMER_BILLING_EMAIL?: string;
  PILOT_CUSTOMER_PHONE?: string;
  PILOT_CUSTOMER_USER_NAME?: string;
  PILOT_CUSTOMER_USER_EMAIL?: string;
  PILOT_CUSTOMER_USER_PASSWORD?: string;
};

function requireEnvValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
}

function optionalEnvValue(name: keyof OptionalBootstrapEnv) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function assertPassword(name: string, value: string) {
  if (value.length < 8) {
    throw new Error(`${name} must be at least 8 characters.`);
  }
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function validateOptionalCustomerConfig() {
  const companyName = optionalEnvValue("PILOT_CUSTOMER_COMPANY_NAME");
  const userName = optionalEnvValue("PILOT_CUSTOMER_USER_NAME");
  const userEmail = optionalEnvValue("PILOT_CUSTOMER_USER_EMAIL");
  const userPassword = optionalEnvValue("PILOT_CUSTOMER_USER_PASSWORD");

  const values = [companyName, userName, userEmail, userPassword];
  const providedCount = values.filter(Boolean).length;
  if (providedCount > 0 && providedCount < values.length) {
    throw new Error(
      "Optional customer bootstrap requires PILOT_CUSTOMER_COMPANY_NAME, PILOT_CUSTOMER_USER_NAME, PILOT_CUSTOMER_USER_EMAIL, and PILOT_CUSTOMER_USER_PASSWORD together."
    );
  }

  if (userPassword) {
    assertPassword("PILOT_CUSTOMER_USER_PASSWORD", userPassword);
  }

  return {
    companyName,
    userName,
    userEmail,
    userPassword,
    contactName: optionalEnvValue("PILOT_CUSTOMER_CONTACT_NAME"),
    billingEmail: optionalEnvValue("PILOT_CUSTOMER_BILLING_EMAIL"),
    phone: optionalEnvValue("PILOT_CUSTOMER_PHONE")
  };
}

async function main() {
  requireEnvValue("DATABASE_URL");

  const tenantName = requireEnvValue("PILOT_TENANT_NAME");
  const tenantSlug = requireEnvValue("PILOT_TENANT_SLUG");
  const officeAdminName = requireEnvValue("PILOT_OFFICE_ADMIN_NAME");
  const officeAdminEmail = normalizeEmail(requireEnvValue("PILOT_OFFICE_ADMIN_EMAIL"));
  const officeAdminPassword = requireEnvValue("PILOT_OFFICE_ADMIN_PASSWORD");
  const technicianName = requireEnvValue("PILOT_TECHNICIAN_NAME");
  const technicianEmail = normalizeEmail(requireEnvValue("PILOT_TECHNICIAN_EMAIL"));
  const technicianPassword = requireEnvValue("PILOT_TECHNICIAN_PASSWORD");
  const timezone = optionalEnvValue("PILOT_TIMEZONE") ?? "America/Chicago";
  const billingEmail = optionalEnvValue("PILOT_BILLING_EMAIL");
  const optionalCustomer = validateOptionalCustomerConfig();
  const { professionalPlan } = await ensureBillingPlans();

  assertPassword("PILOT_OFFICE_ADMIN_PASSWORD", officeAdminPassword);
  assertPassword("PILOT_TECHNICIAN_PASSWORD", technicianPassword);

  const [officeAdminPasswordHash, technicianPasswordHash, customerPasswordHash] = await Promise.all([
    hash(officeAdminPassword, 12),
    hash(technicianPassword, 12),
    optionalCustomer.userPassword ? hash(optionalCustomer.userPassword, 12) : Promise.resolve(null)
  ]);

  const existingTenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      subscriptionPlanId: true,
      stripeSubscriptionStatus: true
    }
  });

  const tenant = existingTenant
    ? await prisma.tenant.update({
        where: { id: existingTenant.id },
        data: {
          name: tenantName,
          timezone,
          billingEmail,
          subscriptionPlanId: existingTenant.subscriptionPlanId ?? professionalPlan.id,
          stripeSubscriptionStatus: existingTenant.stripeSubscriptionStatus ?? "active"
        }
      })
    : await prisma.tenant.create({
        data: {
          slug: tenantSlug,
          name: tenantName,
          timezone,
          billingEmail,
          subscriptionPlanId: professionalPlan.id,
          stripeSubscriptionStatus: "active"
        }
      });

  await prisma.user.upsert({
    where: { email: officeAdminEmail },
    update: {
      tenantId: tenant.id,
      customerCompanyId: null,
      name: officeAdminName,
      passwordHash: officeAdminPasswordHash,
      role: "office_admin",
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      email: officeAdminEmail,
      name: officeAdminName,
      passwordHash: officeAdminPasswordHash,
      role: "office_admin"
    }
  });

  await prisma.user.upsert({
    where: { email: technicianEmail },
    update: {
      tenantId: tenant.id,
      customerCompanyId: null,
      name: technicianName,
      passwordHash: technicianPasswordHash,
      role: "technician",
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      email: technicianEmail,
      name: technicianName,
      passwordHash: technicianPasswordHash,
      role: "technician"
    }
  });

  if (optionalCustomer.companyName && optionalCustomer.userName && optionalCustomer.userEmail && customerPasswordHash) {
    const existingCustomerCompany = await prisma.customerCompany.findFirst({
      where: {
        tenantId: tenant.id,
        name: optionalCustomer.companyName
      },
      select: { id: true }
    });

    const customerCompany = existingCustomerCompany
      ? await prisma.customerCompany.update({
          where: { id: existingCustomerCompany.id },
          data: {
            contactName: optionalCustomer.contactName,
            billingEmail: optionalCustomer.billingEmail,
            phone: optionalCustomer.phone
          }
        })
      : await prisma.customerCompany.create({
          data: {
            tenantId: tenant.id,
            name: optionalCustomer.companyName,
            contactName: optionalCustomer.contactName,
            billingEmail: optionalCustomer.billingEmail,
            phone: optionalCustomer.phone
          }
        });

    await prisma.user.upsert({
      where: { email: normalizeEmail(optionalCustomer.userEmail) },
      update: {
        tenantId: tenant.id,
        customerCompanyId: customerCompany.id,
        name: optionalCustomer.userName,
        passwordHash: customerPasswordHash,
        role: "customer_user",
        isActive: true
      },
      create: {
        tenantId: tenant.id,
        customerCompanyId: customerCompany.id,
        email: normalizeEmail(optionalCustomer.userEmail),
        name: optionalCustomer.userName,
        passwordHash: customerPasswordHash,
        role: "customer_user"
      }
    });
  }

  console.log("Pilot bootstrap complete.");
  console.log(`Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`Office admin: ${officeAdminEmail}`);
  console.log(`Technician: ${technicianEmail}`);
  if (optionalCustomer.companyName && optionalCustomer.userEmail) {
    console.log(`Customer company: ${optionalCustomer.companyName}`);
    console.log(`Customer user: ${normalizeEmail(optionalCustomer.userEmail)}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
