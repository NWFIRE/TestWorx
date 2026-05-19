import type { Prisma } from "@prisma/client";
import { prisma } from "@testworx/db";

type QueryableDatabase = (Pick<typeof prisma, "$queryRaw"> | Pick<Prisma.TransactionClient, "$queryRaw">) & {
  $queryRawUnsafe?: (query: string, ...values: unknown[]) => Promise<unknown>;
};

const workOrderLineItemTableCheckSql = `
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'WorkOrderLineItem'
  ) AS "exists"
`;

const workOrderLaborTypeTableCheckSql = `
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'WorkOrderLaborType'
  ) AS "exists"
`;

const workOrderLaborLineColumnsCheckSql = `
  SELECT COUNT(*)::int AS "count"
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'WorkOrderLineItem'
    AND column_name IN (
      'laborTypeId',
      'laborTypeName',
      'laborHours',
      'laborRate',
      'laborTotal',
      'laborBillingLineId'
    )
`;

export async function hasWorkOrderLineItemTable(db: QueryableDatabase = prisma) {
  try {
    const rows = db.$queryRawUnsafe
      ? await db.$queryRawUnsafe(workOrderLineItemTableCheckSql) as Array<{ exists: boolean }>
      : await db.$queryRaw<Array<{ exists: boolean }>>`
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'WorkOrderLineItem'
          ) AS "exists"
        `;

    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  }
}

export async function assertWorkOrderLineItemTable(db?: QueryableDatabase) {
  if (await hasWorkOrderLineItemTable(db)) {
    return;
  }

  throw new Error("Work order line items are not enabled for this database yet.");
}

export async function hasWorkOrderLaborTypeTable(db: QueryableDatabase = prisma) {
  try {
    const rows = db.$queryRawUnsafe
      ? await db.$queryRawUnsafe(workOrderLaborTypeTableCheckSql) as Array<{ exists: boolean }>
      : await db.$queryRaw<Array<{ exists: boolean }>>`
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'WorkOrderLaborType'
          ) AS "exists"
        `;

    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  }
}

export async function assertWorkOrderLaborTypeTable(db?: QueryableDatabase) {
  if (await hasWorkOrderLaborTypeTable(db)) {
    return;
  }

  throw new Error("Work order labor type settings are not enabled for this database yet.");
}

export async function hasWorkOrderLaborLineColumns(db: QueryableDatabase = prisma) {
  try {
    const rows = db.$queryRawUnsafe
      ? await db.$queryRawUnsafe(workOrderLaborLineColumnsCheckSql) as Array<{ count: number | bigint }>
      : await db.$queryRaw<Array<{ count: number | bigint }>>`
          SELECT COUNT(*)::int AS "count"
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'WorkOrderLineItem'
            AND column_name IN (
              'laborTypeId',
              'laborTypeName',
              'laborHours',
              'laborRate',
              'laborTotal',
              'laborBillingLineId'
            )
        `;

    return Number(rows[0]?.count ?? 0) >= 6;
  } catch {
    return false;
  }
}
