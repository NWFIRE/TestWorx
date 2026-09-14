# Service request history

Office users can expand **Resolved request history** on Service requests and select **View details** on a resolved or declined request. History includes the original description, customer/site context, priority, request type, requester, equipment notes, preferred timing, office note, reviewer, and timestamps in the company timezone.

History is read-only and includes older requests beyond the former 30-request cutoff. Opening details does not reopen, acknowledge, or schedule a request. The existing office-role and tenant-scoped query remain unchanged.

Run `node scripts/check-resolved-request-details.cjs` for keyboard, content, optional-field, and read-only browser checks.
