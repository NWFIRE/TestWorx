# Inspection deletion navigation

Both admin delete controls remove successfully deleted inspection IDs from the
tab's app-navigation history before replacing the URL or refreshing the list.
The deletion service returns all removed IDs, including recurring occurrences.
Unsuccessful or cancelled deletions do not change navigation history.

After a deletion the app Back button consumes cleaned history using replacement
navigation, because browser history can still contain inaccessible older URLs.
The root navigation tracker redirects revisits to known deleted inspection,
report, or billing routes to the appropriate inspection list. This protection
persists in session storage, with an in-memory fallback when storage is blocked.
It applies to deletions made in this tab, not deletions made on another device.

Delete redirects are restricted to stable admin queues and preserve query filters.
No deletion permissions, accounting guards, or database schema were changed.
