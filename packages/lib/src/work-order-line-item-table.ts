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
