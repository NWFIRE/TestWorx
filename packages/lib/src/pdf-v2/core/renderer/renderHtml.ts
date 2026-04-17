import "server-only";

import type { ReactElement } from "react";
import { pdfCss } from "../styles/pdf-css";

export async function renderPdfHtml(element: ReactElement): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const markup = renderToStaticMarkup(element);

  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charSet="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<style>${pdfCss}</style>`,
    "</head>",
    `<body><div class="pdf-document">${markup}</div></body>`,
    "</html>"
  ].join("");
}
