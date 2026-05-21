import React from "react";

import type { PdfShellProps } from "../types/common";
import { pageClassName } from "../layout/page";

export function PdfShell({ children, pageNumber, totalPages, footer, header, className }: PdfShellProps) {
  return (
    <section className={pageClassName(className)}>
      {header}
      <div className="pdf-shell__body">{children}</div>
      {footer ?? (
        <footer className="pdf-footer">
          {pageNumber ? <span style={{ marginLeft: "auto" }}>Page {pageNumber}{totalPages ? ` of ${totalPages}` : ""}</span> : null}
        </footer>
      )}
    </section>
  );
}
