import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getReportPhotoValidationError, prepareReportPhotoForDraft, reportPhotoPreparationConfig } from "../report-photo";

type MockCanvas = {
  width: number;
  height: number;
  getContext: ReturnType<typeof vi.fn>;
  toBlob: (callback: BlobCallback, mimeType?: string, quality?: number) => void;
};

let mockImageWidth = 4000;
let mockImageHeight = 3000;
let mockBlobFactory: (width: number, height: number, mimeType?: string, quality?: number) => Blob | null;

function createSizedBlob(size: number, mimeType = "image/jpeg") {
  return new Blob([new Uint8Array(size)], { type: mimeType });
}

beforeEach(() => {
  mockImageWidth = 4000;
  mockImageHeight = 3000;
  mockBlobFactory = () => createSizedBlob(900_000);

  const documentMock = {
    createElement: vi.fn((tagName: string) => {
      if (tagName !== "canvas") {
        throw new Error(`Unexpected element requested: ${tagName}`);
      }

      const context = {
        drawImage: vi.fn()
      };
      const canvas: MockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => context),
        toBlob: (callback, mimeType, quality) => callback(mockBlobFactory(canvas.width, canvas.height, mimeType, quality))
      };
      return canvas;
    })
  };

  class MockImage {
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;
    naturalWidth = mockImageWidth;
    naturalHeight = mockImageHeight;

    set src(_: string) {
      this.naturalWidth = mockImageWidth;
      this.naturalHeight = mockImageHeight;
      queueMicrotask(() => this.onload?.());
    }
  }

  class MockFileReader {
    result: string | ArrayBuffer | null = null;
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;
    error: DOMException | null = null;

    readAsDataURL(blob: Blob) {
      this.result = `data:${blob.type};base64,prepared`;
      queueMicrotask(() => this.onload?.());
    }
  }

  vi.stubGlobal("document", documentMock);
  vi.stubGlobal("Image", MockImage);
  vi.stubGlobal("FileReader", MockFileReader);
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:mock-image"),
    revokeObjectURL: vi.fn()
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("report photo preparation", () => {
  it("rejects unsupported non-image files", () => {
    const file = new File(["plain"], "notes.txt", { type: "text/plain" });
    expect(getReportPhotoValidationError(file)).toBe("Only image files can be used for report photos.");
  });

  it("rejects raw images that are too large to process", () => {
    const file = {
      type: "image/jpeg",
      size: reportPhotoPreparationConfig.sourceMaxBytes + 1
    } as Pick<File, "type" | "size">;

    expect(getReportPhotoValidationError(file)).toBe("This photo is too large to process. Retake it at a lower resolution or crop it before uploading.");
  });

  it("resizes and compresses large photos before returning a data url", async () => {
    mockImageWidth = 4000;
    mockImageHeight = 3000;
    mockBlobFactory = (width, height) => createSizedBlob(width === 1600 && height === 1200 ? 850_000 : 950_000);

    const file = new File([new Uint8Array([1, 2, 3])], "large.png", { type: "image/png" });
    const prepared = await prepareReportPhotoForDraft(file);

    expect(prepared.mimeType).toBe(reportPhotoPreparationConfig.outputMimeType);
    expect(prepared.byteSize).toBeLessThanOrEqual(reportPhotoPreparationConfig.preparedMaxBytes);
    expect(prepared.width).toBe(1600);
    expect(prepared.height).toBe(1200);
    expect(prepared.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("keeps already-small photos at their original dimensions", async () => {
    mockImageWidth = 800;
    mockImageHeight = 600;
    mockBlobFactory = (width, height) => createSizedBlob(width === 800 && height === 600 ? 240_000 : 500_000);

    const file = new File([new Uint8Array([1, 2, 3])], "small.jpg", { type: "image/jpeg" });
    const prepared = await prepareReportPhotoForDraft(file);

    expect(prepared.width).toBe(800);
    expect(prepared.height).toBe(600);
    expect(prepared.byteSize).toBe(240_000);
  });

  it("fails with a clear message when a photo cannot be reduced under the hard cap", async () => {
    mockImageWidth = 4000;
    mockImageHeight = 3000;
    mockBlobFactory = () => createSizedBlob(reportPhotoPreparationConfig.preparedMaxBytes + 100_000);

    const file = new File([new Uint8Array([1, 2, 3])], "stubborn.jpg", { type: "image/jpeg" });

    await expect(prepareReportPhotoForDraft(file)).rejects.toThrow(
      /could not be reduced enough for report saving/i
    );
  });
});
