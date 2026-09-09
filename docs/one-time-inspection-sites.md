# One-time inspection sites

When creating an inspection, office administrators can select **Create one-time site** and provide just a site name. Address lines, city, state, postal code, and site notes are optional. Partial addresses are accepted and preserved.

Omitted address fields are stored as empty strings (or null for address line 2), without inventing an address or copying the customer's billing address. The site remains linked to the selected customer and tenant for existing inspection, report, and billing workflows.

Regular customer site forms, PO sites, and generic sites retain their existing behavior. No database migration is required.
