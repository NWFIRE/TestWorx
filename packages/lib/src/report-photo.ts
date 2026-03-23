const REPORT_PHOTO_SOURCE_MAX_BYTES = 8 * 1024 * 1024;
const REPORT_PHOTO_PREPARED_MAX_BYTES = 1 * 1024 * 1024;
const REPORT_PHOTO_MAX_LONG_EDGE = 1600;
const REPORT_PHOTO_MIN_LONG_EDGE = 800;
const REPORT_PHOTO_INITIAL_QUALITY = 0.72;
const REPORT_PHOTO_MIN_QUALITY = 0.4;
const REPORT_PHOTO_QUALITY_STEP = 0.08;
const REPORT_PHOTO_DIMENSION_STEP = 0.85;
const REPORT_PHOTO_OUTPUT_MIME_TYPE = "image/jpeg";

export function getReportPhotoValidationError(file: Pick<File, "type" | "size">) {
  if (!file.type.startsWith("image/")) {
    return "Only image files can be used for report photos.";
  }

  if (file.size > REPORT_PHOTO_SOURCE_MAX_BYTES) {
    return "This photo is too large to process. Retake it at a lower resolution or crop it before uploading.";
  }

  return null;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read this photo. Try another image."));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to prepare this photo for upload."));
        return;
      }

      resolve(blob);
    }, mimeType, quality);
  });
}

function resizeDimensions(width: number, height: number, maxLongEdge: number) {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxLongEdge) {
    return { width, height };
  }

  const scale = maxLongEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export async function prepareReportPhotoForDraft(file: File) {
  const validationError = getReportPhotoValidationError(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const image = await loadImageElement(file);
  let targetLongEdge = Math.min(Math.max(image.naturalWidth, image.naturalHeight), REPORT_PHOTO_MAX_LONG_EDGE);

  while (targetLongEdge >= REPORT_PHOTO_MIN_LONG_EDGE) {
    const { width, height } = resizeDimensions(image.naturalWidth, image.naturalHeight, targetLongEdge);
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Photo compression is not supported in this browser.");
    }

    context.drawImage(image, 0, 0, width, height);

    for (let quality = REPORT_PHOTO_INITIAL_QUALITY; quality >= REPORT_PHOTO_MIN_QUALITY; quality = Number((quality - REPORT_PHOTO_QUALITY_STEP).toFixed(2))) {
      const blob = await canvasToBlob(canvas, REPORT_PHOTO_OUTPUT_MIME_TYPE, quality);
      if (blob.size <= REPORT_PHOTO_PREPARED_MAX_BYTES) {
        return {
          dataUrl: await blobToDataUrl(blob),
          mimeType: REPORT_PHOTO_OUTPUT_MIME_TYPE,
          byteSize: blob.size,
          width,
          height
        };
      }
    }

    if (targetLongEdge === REPORT_PHOTO_MIN_LONG_EDGE) {
      break;
    }

    targetLongEdge = Math.max(
      REPORT_PHOTO_MIN_LONG_EDGE,
      Math.floor(targetLongEdge * REPORT_PHOTO_DIMENSION_STEP)
    );
  }

  throw new Error("This photo could not be reduced enough for report saving. Retake it at a lower resolution or crop it before uploading.");
}

export const reportPhotoPreparationConfig = {
  sourceMaxBytes: REPORT_PHOTO_SOURCE_MAX_BYTES,
  preparedMaxBytes: REPORT_PHOTO_PREPARED_MAX_BYTES,
  maxLongEdge: REPORT_PHOTO_MAX_LONG_EDGE,
  minLongEdge: REPORT_PHOTO_MIN_LONG_EDGE,
  outputMimeType: REPORT_PHOTO_OUTPUT_MIME_TYPE
};
