# Inspection deletion confirmation

Confirmation dialogs render through a portal on document.body, outside inspection
rows, clipping containers, and hover transforms. Fast-management rows retain
color/border/shadow hover feedback without moving the button under the pointer.

Enter activates the focused button, including Cancel and single-occurrence
deletion; it never implicitly chooses deletion of all future occurrences.
Escape and backdrop dismissal cancel. Focus returns to the opener without
scrolling, and delayed initial focus cannot replace an intentional selection.

Repeated opener clicks share one confirmation and cannot submit multiple deletes.
The second press of an opening double-click cannot dismiss the backdrop. Failed
deletes retain an actionable error and permit retry. Successful deletes remain
disabled while navigation refreshes, and existing deleted-route cleanup remains.
Server permissions, invoice safeguards, recurrence scopes, and deletion/storage
logic are unchanged.

Run `node scripts/check-inspection-delete-dialog.cjs` for real-browser regression
tests using the actual dialog/button, React StrictMode, and Tailwind styles at
desktop, split-window, and mobile widths. All deletion requests are test doubles;
this test never deletes production data.
