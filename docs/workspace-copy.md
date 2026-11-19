# Workspace copy

The November 2026 copy sweep removes decorative directions, slogans, redundant
section introductions, and implementation commentary from signed-in office,
technician, customer, and platform surfaces. Headings use short descriptive names.
Descriptions that are no longer supplied do not leave empty paragraph spacing.

Keep field labels, record descriptions, report content, validation, empty/loading
states, accessibility labels, upload constraints, tax disclaimers, permission
explanations, destructive-action warnings, and offline/sync guidance. Do not hide
all helper text globally or remove customer-entered content. Public marketing,
emails, and generated report documents are outside this workspace-copy change.

Run `node scripts/check-workspace-copy.cjs` for copy and syntax checks. Pass a
pre-change commit as the first argument to additionally verify that interactive
controls, destinations, and handlers are identical across changed TSX files.
