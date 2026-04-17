import "server-only";

import { createElement } from "react";

import type { PdfInput } from "../types";

import { buildAcceptanceTestRenderModel } from "./adapter/buildAcceptanceTestRenderModel";
import { AcceptanceTestDocument } from "./templates/AcceptanceTestDocument";

async function resolveImageSource(storageKey: string | null | undefined) {
  if (!storageKey) {
    return undefined;
  }

  if (storageKey.startsWith("data:") || !storageKey.startsWith("blob:")) {
    return storageKey;
  }

  const { buildDataUrlStorageKey, decodeStoredFile } = await import("../../storage");
  const decoded = await decodeStoredFile(storageKey);
  return buildDataUrlStorageKey({ mimeType: decoded.mimeType, bytes: decoded.bytes });
}

async function hydratePdfInput(rawReport: PdfInput): Promise<PdfInput> {
  const logoDataUrl = rawReport.tenant.branding && typeof rawReport.tenant.branding === "object"
    ? await resolveImageSource((rawReport.tenant.branding as Record<string, unknown>).logoDataUrl as string | undefined)
    : undefined;

  return {
    ...rawReport,
    tenant: {
      ...rawReport.tenant,
      branding: rawReport.tenant.branding && typeof rawReport.tenant.branding === "object"
        ? { ...(rawReport.tenant.branding as Record<string, unknown>), ...(logoDataUrl ? { logoDataUrl } : {}) }
        : rawReport.tenant.branding
    },
    technicianSignature: rawReport.technicianSignature
      ? {
          ...rawReport.technicianSignature,
          imageDataUrl: (await resolveImageSource(rawReport.technicianSignature.imageDataUrl)) ?? rawReport.technicianSignature.imageDataUrl
        }
      : null,
    customerSignature: rawReport.customerSignature
      ? {
          ...rawReport.customerSignature,
          imageDataUrl: (await resolveImageSource(rawReport.customerSignature.imageDataUrl)) ?? rawReport.customerSignature.imageDataUrl
        }
      : null
  };
}

export async function renderAcceptanceTestPdf(rawReport: unknown): Promise<Buffer> {
  const [{ renderPdfFromHtml }, { renderPdfHtml }] = await Promise.all([
    import("../core/renderer/renderPdf"),
    import("../core/renderer/renderHtml")
  ]);
  const hydrated = await hydratePdfInput(rawReport as PdfInput);
  const model = buildAcceptanceTestRenderModel(hydrated);
  const html = await renderPdfHtml(createElement(AcceptanceTestDocument, { model }));
  return renderPdfFromHtml(html);
}
