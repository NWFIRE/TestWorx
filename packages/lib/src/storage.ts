import { del, get, put } from "@vercel/blob";

import { assertEnvForFeature, getServerEnv } from "./env";

const DATA_URL_PREFIX = "data:";
const BLOB_STORAGE_PREFIX = "blob:";
const storageCategoryValues = [
  "photo",
  "signature",
  "generated-pdf",
  "uploaded-pdf",
  "inspection-document-original",
  "inspection-document-signed"
] as const;

type StorageDriver = "vercel_blob" | "inline";
export type StorageCategory = (typeof storageCategoryValues)[number];
type StoredFilePayload = {
  fileName: string;
  mimeType: string;
  storageKey: string;
  sizeBytes: number;
};

type ReadStoredFileResult = {
  mimeType: string;
  bytes: Uint8Array;
};

export const privateBlobStoreRequiredMessage =
  "TradeWorx requires a private Vercel Blob store for report media. Reconnect storage with private access before technicians save reports, signatures, or PDFs.";

function sanitizePathSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}

function inferStorageDriver(): StorageDriver {
  const configured = getServerEnv().STORAGE_DRIVER;
  if (configured === "vercel_blob" || configured === "inline") {
    return configured;
  }

  return getServerEnv().BLOB_READ_WRITE_TOKEN ? "vercel_blob" : "inline";
}

function requireBlobToken() {
  const { BLOB_READ_WRITE_TOKEN: token } = assertEnvForFeature("storage");
  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required when STORAGE_DRIVER=vercel_blob.");
  }

  return token;
}

export function isPrivateBlobStoreConfigurationError(error: unknown) {
  return error instanceof Error && /private access on a public store|configured with private access/i.test(error.message);
}

function toStorageConfigurationError(error: unknown) {
  if (!isPrivateBlobStoreConfigurationError(error)) {
    return error;
  }

  return new Error(privateBlobStoreRequiredMessage, { cause: error });
}

function toBlobStorageKey(pathname: string) {
  return `${BLOB_STORAGE_PREFIX}${pathname}`;
}

function fromBlobStorageKey(storageKey: string) {
  if (!storageKey.startsWith(BLOB_STORAGE_PREFIX)) {
    throw new Error("Unsupported blob storage key.");
  }

  return storageKey.slice(BLOB_STORAGE_PREFIX.length);
}

export function describeStoredObject(storageKey: string) {
  if (storageKey.startsWith(DATA_URL_PREFIX)) {
    return {
      driver: "inline" as const,
      tenantSegment: null,
      category: null,
      pathname: null
    };
  }

  if (!storageKey.startsWith(BLOB_STORAGE_PREFIX)) {
    throw new Error("Unsupported storage key.");
  }

  const pathname = fromBlobStorageKey(storageKey);
  const [tenantSegment, category] = pathname.split("/", 3);
  const normalizedCategory = storageCategoryValues.find((value) => value === category) ?? null;

  return {
    driver: "vercel_blob" as const,
    tenantSegment: tenantSegment ?? null,
    category: normalizedCategory,
    pathname
  };
}

export function assertStorageKeyBelongsToTenant(storageKey: string, tenantId: string) {
  const descriptor = describeStoredObject(storageKey);
  if (descriptor.driver === "inline") {
    return true;
  }

  const expectedTenant = sanitizePathSegment(tenantId);
  if (descriptor.tenantSegment !== expectedTenant) {
    throw new Error("Stored file does not belong to the current tenant.");
  }

  return true;
}

export function assertStorageKeyCategory(storageKey: string, allowedCategories: StorageCategory[]) {
  const descriptor = describeStoredObject(storageKey);
  if (descriptor.driver === "inline") {
    return true;
  }

  if (!descriptor.category || !allowedCategories.includes(descriptor.category)) {
    throw new Error("Stored file category is not valid for this access path.");
  }

  return true;
}

export function buildDataUrlStorageKey(input: { mimeType: string; bytes: Uint8Array }) {
  return `${DATA_URL_PREFIX}${input.mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`;
}

export async function buildStoredFilePayload(input: {
  tenantId: string;
  category: StorageCategory;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<StoredFilePayload> {
  const driver = inferStorageDriver();
  if (driver === "inline") {
    return {
      fileName: input.fileName,
      mimeType: input.mimeType,
      storageKey: buildDataUrlStorageKey({ mimeType: input.mimeType, bytes: input.bytes }),
      sizeBytes: input.bytes.byteLength
    };
  }

  const token = requireBlobToken();
  const pathname = `${sanitizePathSegment(input.tenantId)}/${input.category}/${Date.now()}-${crypto.randomUUID()}-${sanitizePathSegment(input.fileName)}`;
  let result;
  try {
    result = await put(pathname, Buffer.from(input.bytes), {
      access: "private",
      addRandomSuffix: false,
      contentType: input.mimeType,
      token
    });
  } catch (error) {
    throw toStorageConfigurationError(error);
  }

  return {
    fileName: input.fileName,
    mimeType: result.contentType,
    storageKey: toBlobStorageKey(result.pathname),
    sizeBytes: input.bytes.byteLength
  };
}

export function parseDataUrlStorageKey(storageKey: string) {
  if (!storageKey.startsWith(DATA_URL_PREFIX)) {
    throw new Error("Unsupported storage key.");
  }

  const [metadata, encoded] = storageKey.split(",", 2);
  if (!metadata || !encoded || !metadata.includes(";base64")) {
    throw new Error("Storage key is malformed.");
  }

  const mimeType = metadata.slice(DATA_URL_PREFIX.length, metadata.indexOf(";base64"));
  return {
    mimeType,
    bytes: Uint8Array.from(Buffer.from(encoded, "base64"))
  };
}

export async function readStoredFile(storageKey: string): Promise<ReadStoredFileResult> {
  if (storageKey.startsWith(DATA_URL_PREFIX)) {
    return parseDataUrlStorageKey(storageKey);
  }

  if (storageKey.startsWith(BLOB_STORAGE_PREFIX)) {
    const token = requireBlobToken();
    let result;
    try {
      result = await get(fromBlobStorageKey(storageKey), {
        access: "private",
        token,
        useCache: false
      });
    } catch (error) {
      throw toStorageConfigurationError(error);
    }

    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error("Stored file could not be retrieved.");
    }

    const response = new Response(result.stream);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      mimeType: result.blob.contentType,
      bytes
    };
  }

  throw new Error("Unsupported storage key.");
}

export async function deleteStoredFile(storageKey: string) {
  if (!storageKey.startsWith(BLOB_STORAGE_PREFIX)) {
    return;
  }

  const token = requireBlobToken();
  await del(fromBlobStorageKey(storageKey), { token });
}

export async function decodeStoredFile(storageKey: string) {
  return readStoredFile(storageKey);
}

export async function buildFileDownloadResponse(input: { storageKey: string; fileName: string; fallbackMimeType: string }) {
  const decoded = await readStoredFile(input.storageKey);
  return {
    fileName: input.fileName,
    mimeType: decoded.mimeType || input.fallbackMimeType,
    bytes: decoded.bytes
  };
}

export function isStoredBlobKey(storageKey: string) {
  return storageKey.startsWith(BLOB_STORAGE_PREFIX);
}
