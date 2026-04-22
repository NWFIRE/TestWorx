UPDATE "CustomerCompany"
SET
  "paymentTermsCode" = 'net_30',
  "updatedAt" = NOW()
WHERE "paymentTermsCode" = 'due_on_receipt';
