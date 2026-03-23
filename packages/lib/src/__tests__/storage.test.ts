import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetServerEnvForTests } from "../env";

const putMock = vi.fn();
const getMock = vi.fn();
const delMock = vi.fn();

vi.mock("@vercel/blob", () => ({
  put: putMock,
  get: getMock,
  del: delMock
}));

describe("storage abstraction", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetServerEnvForTests();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/testworx?schema=public");
    vi.stubEnv("AUTH_SECRET", "replace-with-a-long-random-secret");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("STORAGE_DRIVER", "vercel_blob");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob_rw_token");
    resetServerEnvForTests();
  });

  it("stores blob uploads as private tenant-scoped objects", async () => {
    putMock.mockResolvedValue({
      pathname: "tenant-1/photo/1710000000000-test-file.png",
      contentType: "image/png"
    });

    const { buildStoredFilePayload } = await import("../storage");
    const result = await buildStoredFilePayload({
      tenantId: "tenant_1",
      category: "photo",
      fileName: "Test File.png",
      mimeType: "image/png",
      bytes: new Uint8Array([1, 2, 3])
    });

    expect(putMock).toHaveBeenCalledWith(
      expect.stringMatching(/^tenant_1\/photo\//),
      expect.any(Buffer),
      expect.objectContaining({
        access: "private",
        token: "blob_rw_token",
        contentType: "image/png"
      })
    );
    expect(result.storageKey).toBe("blob:tenant-1/photo/1710000000000-test-file.png");
  });

  it("retrieves blob-backed files through private access only", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([37, 80, 68, 70]));
        controller.close();
      }
    });
    getMock.mockResolvedValue({
      statusCode: 200,
      stream,
      blob: { contentType: "application/pdf" }
    });

    const { readStoredFile } = await import("../storage");
    const result = await readStoredFile("blob:tenant-1/generated-pdf/report.pdf");

    expect(getMock).toHaveBeenCalledWith("tenant-1/generated-pdf/report.pdf", expect.objectContaining({
      access: "private",
      token: "blob_rw_token",
      useCache: false
    }));
    expect(result.mimeType).toBe("application/pdf");
    expect(Array.from(result.bytes)).toEqual([37, 80, 68, 70]);
  });

  it("validates blob storage keys against tenant and category constraints", async () => {
    const {
      assertStorageKeyBelongsToTenant,
      assertStorageKeyCategory,
      describeStoredObject
    } = await import("../storage");

    expect(describeStoredObject("blob:tenant_1/uploaded-pdf/file.pdf")).toMatchObject({
      driver: "vercel_blob",
      tenantSegment: "tenant_1",
      category: "uploaded-pdf"
    });

    expect(() => assertStorageKeyBelongsToTenant("blob:tenant_1/uploaded-pdf/file.pdf", "tenant_1")).not.toThrow();
    expect(() => assertStorageKeyBelongsToTenant("blob:tenant_2/uploaded-pdf/file.pdf", "tenant_1")).toThrow(/does not belong to the current tenant/i);
    expect(() => assertStorageKeyCategory("blob:tenant_1/uploaded-pdf/file.pdf", ["uploaded-pdf"])).not.toThrow();
    expect(() => assertStorageKeyCategory("blob:tenant_1/photo/file.png", ["uploaded-pdf"])).toThrow(/category is not valid/i);
  });
});
