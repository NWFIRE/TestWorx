import { describe, expect, it } from "vitest";

import { directQuickBooksInvoiceInputSchema } from "../quickbooks";
import { quoteInputSchema } from "../quotes";

describe("line item quantities", () => {
  it("requires direct invoice quantities to be whole-number units", () => {
    const result = directQuickBooksInvoiceInputSchema.safeParse({
      walkInCustomerName: "Counter Sale",
      issueDate: "2026-04-27",
      lineItems: [
        {
          catalogItemId: "catalog_1",
          description: "Recharge",
          quantity: 1.5,
          unitPrice: 35,
          taxable: false
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("requires quote quantities to be whole-number units", () => {
    const result = quoteInputSchema.safeParse({
      customerCompanyId: "customer_1",
      issuedAt: "2026-04-27",
      taxAmount: 0,
      lineItems: [
        {
          internalCode: "recharge",
          title: "Recharge",
          quantity: 2.25,
          unitPrice: 35,
          discountAmount: 0,
          taxable: false
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("accepts whole-number quantities for quotes and direct invoices", () => {
    expect(
      directQuickBooksInvoiceInputSchema.safeParse({
        walkInCustomerName: "Counter Sale",
        issueDate: "2026-04-27",
        lineItems: [
          {
            catalogItemId: "catalog_1",
            description: "Recharge",
            quantity: 2,
            unitPrice: 35,
            taxable: false
          }
        ]
      }).success
    ).toBe(true);

    expect(
      quoteInputSchema.safeParse({
        customerCompanyId: "customer_1",
        issuedAt: "2026-04-27",
        taxAmount: 0,
        lineItems: [
          {
            internalCode: "recharge",
            title: "Recharge",
            quantity: 2,
            unitPrice: 35,
            discountAmount: 0,
            taxable: false
          }
        ]
      }).success
    ).toBe(true);
  });
});
