import { pdfTokens } from "./tokens";

export const pdfCss = `
  :root {
    --pdf-text: ${pdfTokens.color.text};
    --pdf-muted: ${pdfTokens.color.muted};
    --pdf-border: ${pdfTokens.color.border};
    --pdf-panel: ${pdfTokens.color.panel};
    --pdf-success: ${pdfTokens.color.success};
    --pdf-warning: ${pdfTokens.color.warning};
    --pdf-danger: ${pdfTokens.color.danger};
    --pdf-space-8: ${pdfTokens.space[8]};
    --pdf-space-12: ${pdfTokens.space[12]};
    --pdf-space-16: ${pdfTokens.space[16]};
    --pdf-space-24: ${pdfTokens.space[24]};
    --pdf-space-32: ${pdfTokens.space[32]};
    --pdf-radius-sm: ${pdfTokens.radius.sm};
    --pdf-radius-md: ${pdfTokens.radius.md};
    --tenant-primary: #1e3a5f;
    --tenant-accent: #c2410c;
  }

  @page {
    size: Letter;
    margin: 0.45in 0.55in 0.55in 0.55in;
  }

  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  html, body {
    margin: 0;
    padding: 0;
    color: var(--pdf-text);
    font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
    font-size: ${pdfTokens.fontSize.md};
    line-height: 1.45;
    background: white;
  }

  .pdf-document { width: 100%; }
  .pdf-shell {
    display: flex;
    flex-direction: column;
    gap: var(--pdf-space-16);
    min-height: calc(11in - 1in);
    break-after: page;
    page-break-after: always;
  }
  .pdf-shell:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  .pdf-shell__body {
    display: flex;
    flex-direction: column;
    gap: var(--pdf-space-16);
    flex: 1;
  }

  .pdf-header, .pdf-outcome-hero, .pdf-compliance-block, .pdf-identity-band, .pdf-section, .pdf-table-wrap, .pdf-photo-frame, .pdf-signature-card {
    border: 1px solid var(--pdf-border);
    border-radius: var(--pdf-radius-md);
    background: white;
  }

  .pdf-header, .pdf-compliance-block, .pdf-identity-band, .pdf-section, .pdf-photo-frame, .pdf-signature-card {
    padding: var(--pdf-space-16);
  }

  .pdf-header__grid, .pdf-summary-strip, .pdf-footer {
    display: flex;
    justify-content: space-between;
    gap: var(--pdf-space-16);
  }

  .pdf-header__left, .pdf-header__right {
    display: flex;
    flex-direction: column;
    gap: var(--pdf-space-8);
  }
  .pdf-header__left { flex: 1.2; }
  .pdf-header__right { flex: 1; align-items: flex-end; text-align: right; }
  .pdf-header__brand { display: flex; align-items: center; gap: var(--pdf-space-12); }
  .pdf-header__logo, .pdf-header__logo-fallback { width: 48px; height: 48px; border-radius: var(--pdf-radius-sm); }
  .pdf-header__logo { object-fit: contain; }
  .pdf-header__logo-fallback { background: var(--pdf-panel); border: 1px solid var(--pdf-border); }

  .pdf-kicker, .pdf-label {
    color: var(--pdf-muted);
    font-size: ${pdfTokens.fontSize.xs};
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 700;
  }
  .pdf-company-name { font-size: ${pdfTokens.fontSize.xl}; font-weight: 700; line-height: 1.1; }
  .pdf-title { font-size: 28px; font-weight: 800; line-height: 1.1; }
  .pdf-header__meta, .pdf-text-sm, .pdf-muted, .pdf-section-subtitle, .pdf-empty-state { color: var(--pdf-muted); font-size: ${pdfTokens.fontSize.sm}; }
  .pdf-divider { border-top: 1px solid var(--pdf-border); }

  .pdf-outcome-hero {
    padding: 20px;
    display: flex;
    gap: var(--pdf-space-16);
    background: linear-gradient(180deg, #fff 0%, #f7f9fc 100%);
  }
  .pdf-outcome-hero--success { border-color: rgba(30,106,74,.35); }
  .pdf-outcome-hero--warning { border-color: rgba(154,103,0,.35); }
  .pdf-outcome-hero--danger { border-color: rgba(163,40,40,.35); }
  .pdf-hero-value { font-size: ${pdfTokens.fontSize.hero}; font-weight: 800; line-height: 1; margin: 0 0 var(--pdf-space-8); }
  .pdf-hero-value--success, .pdf-tone-success { color: var(--pdf-success); }
  .pdf-hero-value--warning, .pdf-tone-warning { color: var(--pdf-warning); }
  .pdf-hero-value--danger, .pdf-tone-danger { color: var(--pdf-danger); }
  .pdf-outcome-hero__result { flex: 1; }
  .pdf-outcome-hero__metrics, .pdf-metric-grid, .pdf-metadata-grid { display: grid; gap: var(--pdf-space-12); }
  .pdf-outcome-hero__metrics { min-width: 220px; grid-template-columns: repeat(2, minmax(0,1fr)); }
  .pdf-identity-band { display: grid; grid-template-columns: 1.1fr .9fr; gap: var(--pdf-space-16); }
  .pdf-identity-band__anchor { font-size: ${pdfTokens.fontSize.xl}; font-weight: 700; line-height: 1.2; }
  .pdf-metadata-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pdf-metadata-grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .pdf-metadata-grid--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .pdf-metadata-item, .pdf-metric-item { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .pdf-metadata-value { font-size: ${pdfTokens.fontSize.md}; font-weight: 600; }
  .pdf-metric-value { font-size: ${pdfTokens.fontSize.lg}; font-weight: 800; line-height: 1.1; }
  .pdf-compliance-codes { font-size: ${pdfTokens.fontSize.lg}; font-weight: 700; }
  .pdf-section { display: flex; flex-direction: column; gap: var(--pdf-space-12); }
  .pdf-section-title { margin: 0; font-size: ${pdfTokens.fontSize.xl}; line-height: 1.2; }

  .pdf-summary-strip { flex-wrap: wrap; gap: var(--pdf-space-12); }
  .pdf-summary-strip__item {
    padding: 10px 12px;
    border: 1px solid var(--pdf-border);
    border-radius: var(--pdf-radius-sm);
    background: var(--pdf-panel);
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }

  .pdf-badge {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--pdf-border);
    border-radius: 999px;
    padding: 3px 9px;
    font-size: ${pdfTokens.fontSize.xs};
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .pdf-bg-success { background: rgba(30,106,74,.08); border-color: rgba(30,106,74,.18); }
  .pdf-bg-warning { background: rgba(154,103,0,.08); border-color: rgba(154,103,0,.18); }
  .pdf-bg-danger { background: rgba(163,40,40,.08); border-color: rgba(163,40,40,.18); }
  .pdf-bg-muted { background: var(--pdf-panel); }

  .pdf-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: ${pdfTokens.fontSize.sm}; }
  .pdf-table thead { display: table-header-group; }
  .pdf-table tr { break-inside: avoid; page-break-inside: avoid; }
  .pdf-table th, .pdf-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--pdf-border);
    vertical-align: top;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  .pdf-table th {
    color: var(--pdf-muted);
    font-size: ${pdfTokens.fontSize.xs};
    text-transform: uppercase;
    letter-spacing: 0.08em;
    text-align: left;
    font-weight: 700;
    background: rgba(245,247,251,.92);
  }
  .pdf-table--compact th, .pdf-table--compact td { padding-top: 8px; padding-bottom: 8px; }
  .pdf-cell-lines { display: flex; flex-direction: column; gap: 4px; }
  .pdf-photo-grid { display: grid; gap: var(--pdf-space-16); grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pdf-photo-grid--single { grid-template-columns: 1fr; }
  .pdf-photo-image { width: 100%; max-height: 300px; object-fit: contain; border-radius: var(--pdf-radius-sm); background: var(--pdf-panel); }
  .pdf-signature-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: var(--pdf-space-16); }
  .pdf-signature-grid--single { grid-template-columns: 1fr; }
  .pdf-signature-image { width: 100%; max-height: 96px; object-fit: contain; margin-top: var(--pdf-space-12); border-top: 1px solid var(--pdf-border); padding-top: var(--pdf-space-12); }
  .pdf-footer { margin-top: auto; padding-top: var(--pdf-space-8); border-top: 1px solid var(--pdf-border); font-size: ${pdfTokens.fontSize.xs}; color: var(--pdf-muted); }
`;
