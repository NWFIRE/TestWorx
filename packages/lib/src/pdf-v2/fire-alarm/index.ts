import { createElement } from "react";
import { buildDataUrlStorageKey, decodeStoredFile } from "../../storage";
import type { PdfInput } from "../types";

import { buildFireAlarmRenderModel } from "./adapter/buildFireAlarmRenderModel";
import { FireAlarmReportDocument } from "./templates/FireAlarmReportDocument";

async function resolveImageSource(storageKey: string | null | undefined) {
  if (!storageKey) {
    return undefined;
  }

  if (storageKey.startsWith("data:")) {
    return storageKey;
  }

  if (!storageKey.startsWith("blob:")) {
    return storageKey;
  }

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
    photos: await Promise.all(rawReport.photos.map(async (photo) => ({
      ...photo,
      storageKey: (await resolveImageSource(photo.storageKey)) ?? photo.storageKey
    }))),
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

export async function renderFireAlarmPdf(rawReport: unknown): Promise<Buffer> {
  const [{ renderPdfFromHtml }, { renderPdfHtml }] = await Promise.all([
    import("../core/renderer/renderPdf"),
    import("../core/renderer/renderHtml")
  ]);
  const hydrated = await hydratePdfInput(rawReport as PdfInput);
  const model = buildFireAlarmRenderModel(hydrated);
  const html = await renderPdfHtml(createElement(FireAlarmReportDocument, { model }));
  return renderPdfFromHtml(html);
}
