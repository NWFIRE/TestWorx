"use client";

type DroppedPdfResult = {
  files: File[];
  unsupportedCloudReference: boolean;
  downloadFailed: boolean;
};

function getFileItems(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

function getDataTransferFiles(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.files ?? []);
}

function extractDownloadUrlPayload(payload: string) {
  const trimmedPayload = payload.trim();
  if (!trimmedPayload) {
    return null;
  }

  const parts = trimmedPayload.split(":");
  const protocol = parts[2];
  if (parts.length >= 3 && protocol && /^https?$/i.test(protocol)) {
    return {
      mimeType: parts[0] ?? "application/pdf",
      fileName: parts[1] ?? "document.pdf",
      url: parts.slice(2).join(":")
    };
  }

  return null;
}

function extractUrlListPayload(payload: string) {
  return payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && /^https?:\/\//i.test(line));
}

function normalizeDropboxDownloadUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.toLowerCase().endsWith("dropbox.com")) {
      return url;
    }

    parsedUrl.searchParams.set("dl", "1");
    return parsedUrl.toString();
  } catch {
    return url;
  }
}

function getFileNameFromUrl(url: string, fallbackName = "document.pdf") {
  try {
    const parsedUrl = new URL(url);
    const lastSegment = decodeURIComponent(parsedUrl.pathname.split("/").filter(Boolean).pop() ?? "");
    return lastSegment.toLowerCase().endsWith(".pdf") ? lastSegment : fallbackName;
  } catch {
    return fallbackName;
  }
}

async function fetchPdfFromUrl(url: string, fallbackFileName?: string) {
  if (!/^https?:\/\//i.test(url)) {
    return null;
  }

  const normalizedUrl = normalizeDropboxDownloadUrl(url);
  const response = await fetch(normalizedUrl);
  if (!response.ok) {
    throw new Error("Cloud file download failed.");
  }

  const blob = await response.blob();
  const fileName = fallbackFileName || getFileNameFromUrl(normalizedUrl);
  const mimeType = blob.type || "application/pdf";
  const looksLikePdf = mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf") || normalizedUrl.toLowerCase().includes(".pdf");
  if (!looksLikePdf) {
    throw new Error("Cloud file was not a PDF.");
  }

  return new File([blob], fileName, {
    type: mimeType,
    lastModified: Date.now()
  });
}

function getCloudReferenceCandidates(dataTransfer: DataTransfer) {
  const candidates: Array<{ url: string; fileName?: string }> = [];

  const downloadUrlPayload = dataTransfer.getData("DownloadURL");
  const downloadUrl = extractDownloadUrlPayload(downloadUrlPayload);
  if (downloadUrl) {
    candidates.push({ url: downloadUrl.url, fileName: downloadUrl.fileName });
  }

  const uriListUrl = extractUrlListPayload(dataTransfer.getData("text/uri-list"));
  if (uriListUrl) {
    candidates.push({ url: uriListUrl });
  }

  const plainTextUrl = extractUrlListPayload(dataTransfer.getData("text/plain"));
  if (plainTextUrl) {
    candidates.push({ url: plainTextUrl });
  }

  const mozUrl = extractUrlListPayload(dataTransfer.getData("text/x-moz-url"));
  if (mozUrl) {
    candidates.push({ url: mozUrl });
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) {
      return false;
    }
    seen.add(candidate.url);
    return true;
  });
}

function hasCloudReferenceIntent(dataTransfer: DataTransfer) {
  const types = Array.from(dataTransfer.types ?? []);
  return types.some((type) =>
    ["DownloadURL", "text/uri-list", "text/plain", "text/x-moz-url"].includes(type)
  );
}

export async function getDroppedPdfFiles(dataTransfer: DataTransfer): Promise<DroppedPdfResult> {
  const itemFiles = getFileItems(dataTransfer);
  if (itemFiles.length > 0) {
    return { files: itemFiles, unsupportedCloudReference: false, downloadFailed: false };
  }

  const transferFiles = getDataTransferFiles(dataTransfer);
  if (transferFiles.length > 0) {
    return { files: transferFiles, unsupportedCloudReference: false, downloadFailed: false };
  }

  const candidates = getCloudReferenceCandidates(dataTransfer);
  if (candidates.length === 0) {
    return {
      files: [],
      unsupportedCloudReference: hasCloudReferenceIntent(dataTransfer),
      downloadFailed: false
    };
  }

  const files: File[] = [];
  let downloadFailed = false;

  for (const candidate of candidates) {
    try {
      const file = await fetchPdfFromUrl(candidate.url, candidate.fileName);
      if (file) {
        files.push(file);
      }
    } catch {
      downloadFailed = true;
    }
  }

  return {
    files,
    unsupportedCloudReference: files.length === 0,
    downloadFailed
  };
}

export function cloudReferenceDropMessage(downloadFailed: boolean) {
  return downloadFailed
    ? "TradeWorx could not read that cloud PDF link. Open Dropbox, OneDrive, or Google Drive locally and drag the downloaded PDF file, or use click to browse."
    : "That drop did not include an actual PDF file. If this is a Dropbox, OneDrive, or Google Drive file, make it available offline and try again.";
}
