"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { BrandLoader } from "@/app/brand-loader";
import { PageBackControl } from "@/app/page-back-control";

const initialState = { error: null as string | null, success: null as string | null };

const statusClasses: Record<string, string> = {
  UPLOADED: "bg-slate-100 text-slate-700",
  ANNOTATED: "bg-sky-50 text-sky-700",
  READY_FOR_SIGNATURE: "bg-amber-50 text-amber-800",
  SIGNED: "bg-emerald-50 text-emerald-700",
  EXPORTED: "bg-sky-50 text-sky-700"
};

type PdfRenderModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfDocumentProxy = Awaited<ReturnType<PdfRenderModule["getDocument"]>["promise"]>;

type AnnotationPoint = { x: number; y: number };
type AnnotationStroke = {
  pageIndex: number;
  color: string;
  width: number;
  points: AnnotationPoint[];
};

type AnnotationPayload = {
  version: 1;
  strokes: AnnotationStroke[];
};

type RenderedPage = {
  pageIndex: number;
  width: number;
  height: number;
  imageDataUrl: string;
};

const strokeColorOptions = [
  { label: "Blue", value: "#2563eb" },
  { label: "Black", value: "#0f172a" },
  { label: "Red", value: "#dc2626" }
] as const;

const strokeWidthOptions = [
  { label: "Fine", value: 2 },
  { label: "Medium", value: 3.5 },
  { label: "Bold", value: 5 }
] as const;

function ensurePdfJsRuntimeCompatibility() {
  const PromiseCompat = Promise as typeof Promise & {
    withResolvers?: <T>() => {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  };

  if (typeof PromiseCompat.withResolvers !== "function") {
    PromiseCompat.withResolvers = function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((innerResolve, innerReject) => {
        resolve = innerResolve;
        reject = innerReject;
      });

      return { promise, resolve, reject };
    };
  }

  const arrayPrototype = Array.prototype as Array<unknown> & {
    findLast?: <T>(
      this: T[],
      predicate: (value: T, index: number, array: T[]) => boolean,
      thisArg?: unknown
    ) => T | undefined;
  };

  if (typeof arrayPrototype.findLast !== "function") {
    arrayPrototype.findLast = function findLast<T>(
      this: T[],
      predicate: (value: T, index: number, array: T[]) => boolean,
      thisArg?: unknown
    ) {
      for (let index = this.length - 1; index >= 0; index -= 1) {
        const value = this[index];
        if (value !== undefined && predicate.call(thisArg, value, index, this)) {
          return value;
        }
      }

      return undefined;
    };
  }
}

function distanceBetween(a: AnnotationPoint, b: AnnotationPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function buildStrokePath(stroke: AnnotationStroke, width: number, height: number) {
  if (stroke.points.length === 0 || !stroke.points[0]) {
    return "";
  }

  const [firstPoint, ...rest] = stroke.points;
  let path = `M ${firstPoint.x * width} ${firstPoint.y * height}`;
  for (const point of rest) {
    path += ` L ${point.x * width} ${point.y * height}`;
  }
  return path;
}

function PdfMarkupPage({
  page,
  strokes,
  activeColor,
  activeWidth,
  interactionMode,
  disabled,
  onStrokeComplete
}: {
  page: RenderedPage;
  strokes: AnnotationStroke[];
  activeColor: string;
  activeWidth: number;
  interactionMode: "navigate" | "markup";
  disabled: boolean;
  onStrokeComplete: (stroke: AnnotationStroke) => void;
}) {
  const [draftStroke, setDraftStroke] = useState<AnnotationStroke | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const overlayRef = useRef<SVGSVGElement | null>(null);

  function readNormalizedPoint(event: React.PointerEvent<SVGSVGElement>): AnnotationPoint | null {
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0 || bounds.height === 0) {
      return null;
    }

    return {
      x: Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1),
      y: Math.min(Math.max((event.clientY - bounds.top) / bounds.height, 0), 1)
    };
  }

  function commitStroke(stroke: AnnotationStroke | null) {
    if (!stroke || stroke.points.length === 0) {
      setDraftStroke(null);
      setIsDrawing(false);
      return;
    }

    onStrokeComplete(stroke);
    setDraftStroke(null);
    setIsDrawing(false);
  }

  return (
    <div className="space-y-3 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-900">Page {page.pageIndex + 1}</h4>
        <p className="text-xs text-slate-500">
          {interactionMode === "markup"
            ? "Draw directly on the page with finger or Pencil."
            : "Scroll and review without adding markup."}
        </p>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        <Image
          alt={`PDF page ${page.pageIndex + 1}`}
          className="block h-auto w-full"
          draggable={false}
          height={page.height}
          unoptimized
          width={page.width}
          src={page.imageDataUrl}
        />
        <svg
          ref={overlayRef}
          className={`absolute inset-0 h-full w-full ${
            disabled || interactionMode === "navigate" ? "pointer-events-none" : "touch-none"
          }`}
          onPointerCancel={() => commitStroke(draftStroke)}
          onPointerDown={(event) => {
            if (disabled || interactionMode !== "markup") {
              return;
            }

            const point = readNormalizedPoint(event);
            if (!point) {
              return;
            }

            event.currentTarget.setPointerCapture(event.pointerId);
            setIsDrawing(true);
            setDraftStroke({
              pageIndex: page.pageIndex,
              color: activeColor,
              width: activeWidth,
              points: [point]
            });
          }}
          onPointerLeave={() => {
            if (isDrawing) {
              commitStroke(draftStroke);
            }
          }}
          onPointerMove={(event) => {
            if (!isDrawing) {
              return;
            }

            const point = readNormalizedPoint(event);
            if (!point) {
              return;
            }

            setDraftStroke((current) => {
              if (!current) {
                return current;
              }

              const lastPoint = current.points[current.points.length - 1];
              if (lastPoint && distanceBetween(lastPoint, point) < 0.0035) {
                return current;
              }

              return {
                ...current,
                points: [...current.points, point]
              };
            });
          }}
          onPointerUp={() => commitStroke(draftStroke)}
          viewBox={`0 0 ${page.width} ${page.height}`}
        >
          {strokes.map((stroke, index) => (
            stroke.points.length === 1 ? (
              <circle
                key={`${stroke.pageIndex}-${index}`}
                cx={stroke.points[0]!.x * page.width}
                cy={stroke.points[0]!.y * page.height}
                fill={stroke.color}
                r={stroke.width}
              />
            ) : (
              <path
                key={`${stroke.pageIndex}-${index}`}
                d={buildStrokePath(stroke, page.width, page.height)}
                fill="none"
                stroke={stroke.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={stroke.width}
              />
            )
          ))}
          {draftStroke ? (
            draftStroke.points.length === 1 ? (
              <circle
                cx={draftStroke.points[0]!.x * page.width}
                cy={draftStroke.points[0]!.y * page.height}
                fill={draftStroke.color}
                r={draftStroke.width}
              />
            ) : (
              <path
                d={buildStrokePath(draftStroke, page.width, page.height)}
                fill="none"
                stroke={draftStroke.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={draftStroke.width}
              />
            )
          ) : null}
        </svg>
      </div>
    </div>
  );
}

export function ExternalDocumentSigner({
  inspectionId,
  document: inspectionDocument,
  action,
  backNavigation,
  dispatchNotes
}: {
  inspectionId: string;
  document: {
    id: string;
    label: string | null;
    fileName: string;
    requiresSignature: boolean;
    status: string;
    annotatedStorageKey: string | null;
    signedStorageKey: string | null;
  };
  action: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
  backNavigation?: {
    label?: string;
    fallbackHref: string;
  };
  dispatchNotes?: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [annotationStrokes, setAnnotationStrokes] = useState<AnnotationStroke[]>([]);
  const [activeColor, setActiveColor] = useState<string>(strokeColorOptions[0].value);
  const [activeWidth, setActiveWidth] = useState<number>(strokeWidthOptions[1].value);
  const [interactionMode, setInteractionMode] = useState<"navigate" | "markup">("navigate");
  const [loadingPdf, setLoadingPdf] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const originalPdfUrl = useMemo(
    () => `/api/inspection-documents/${inspectionDocument.id}?variant=original&disposition=inline`,
    [inspectionDocument.id]
  );

  useEffect(() => {
    let mounted = true;

    async function loadPdfPages() {
      setLoadingPdf(true);
      setPdfError(null);
      setPages([]);

      try {
        ensurePdfJsRuntimeCompatibility();
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
        if (!("pdfjsWorker" in globalThis)) {
          Object.assign(globalThis, { pdfjsWorker: workerModule });
        }

        const response = await fetch(originalPdfUrl, {
          credentials: "same-origin"
        });
        if (!response.ok) {
          throw new Error("Unable to load the original PDF for signing.");
        }

        const pdfBytes = new Uint8Array(await response.arrayBuffer());

        const loadingTask = pdfjs.getDocument({
          data: pdfBytes,
          isOffscreenCanvasSupported: false,
          isImageDecoderSupported: false,
          useWorkerFetch: false,
          stopAtErrors: true
        });

        const pdfDocument = (await loadingTask.promise) as PdfDocumentProxy;
        const nextPages: RenderedPage[] = [];

        for (let index = 0; index < pdfDocument.numPages; index += 1) {
          const pdfPage = await pdfDocument.getPage(index + 1);
          const viewport = pdfPage.getViewport({ scale: 1.25 });
          const canvas = globalThis.document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("Canvas rendering is not available on this device.");
          }

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;

          nextPages.push({
            pageIndex: index,
            width: canvas.width,
            height: canvas.height,
            imageDataUrl: canvas.toDataURL("image/png")
          });
        }

        if (!mounted) {
          return;
        }

        setPages(nextPages);
      } catch (error) {
        if (!mounted) {
          return;
        }

        setPdfError(error instanceof Error ? error.message : "Unable to load this PDF for markup.");
      } finally {
        if (mounted) {
          setLoadingPdf(false);
        }
      }
    }

    void loadPdfPages();

    return () => {
      mounted = false;
    };
  }, [originalPdfUrl]);

  const annotationPayload = useMemo<AnnotationPayload>(
    () => ({
      version: 1,
      strokes: annotationStrokes
    }),
    [annotationStrokes]
  );

  const totalStrokeCount = annotationStrokes.length;
  const isSignatureWorkflow = inspectionDocument.requiresSignature;
  const savedVariantHref = isSignatureWorkflow
    ? inspectionDocument.signedStorageKey
      ? `/api/inspection-documents/${inspectionDocument.id}?variant=signed&disposition=inline`
      : null
    : inspectionDocument.annotatedStorageKey
      ? `/api/inspection-documents/${inspectionDocument.id}?variant=annotated&disposition=inline`
      : null;
  const savedVariantLabel = isSignatureWorkflow ? "Open saved signed PDF" : "Open saved annotated PDF";

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        {backNavigation ? (
          <PageBackControl className="mb-2" fallbackHref={backNavigation.fallbackHref} label={backNavigation.label} />
        ) : null}
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">External document</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-3xl font-semibold text-ink">{inspectionDocument.label || inspectionDocument.fileName}</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${statusClasses[inspectionDocument.status] ?? statusClasses.UPLOADED}`}>
            {inspectionDocument.status.replaceAll("_", " ")}
          </span>
        </div>
        <p className="mt-3 text-slate-500">
          {isSignatureWorkflow
            ? "Review the attached PDF, switch to Draw / Sign when you are ready to mark it up, and save the signed copy without changing the original upload."
            : "Review the attached PDF, switch to Draw when you are ready to mark it up, and save the annotated copy without changing the original upload."}
        </p>
        {dispatchNotes?.trim() ? (
          <div className="mt-4 rounded-[1.25rem] border border-amber-200 bg-amber-50/80 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-900">Dispatch notes</p>
            <p className="mt-1 text-sm leading-6 text-amber-950 whitespace-pre-wrap">{dispatchNotes.trim()}</p>
          </div>
        ) : null}
      </div>

      <div className="grid items-start gap-6 landscape:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[1.3fr_0.7fr]">
        <div className="order-2 space-y-4 rounded-[2rem] bg-white p-6 shadow-panel landscape:order-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-subtle)] p-1">
              <button
                className={`inline-flex min-h-10 items-center justify-center rounded-[1rem] px-3 text-sm font-semibold transition ${
                  interactionMode === "navigate"
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-[color:var(--text-secondary)] hover:text-slate-950"
                }`}
                onClick={() => setInteractionMode("navigate")}
                type="button"
              >
                Scroll document
              </button>
              <button
                className={`inline-flex min-h-10 items-center justify-center rounded-[1rem] px-3 text-sm font-semibold transition ${
                  interactionMode === "markup"
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-[color:var(--text-secondary)] hover:text-slate-950"
                }`}
                onClick={() => setInteractionMode("markup")}
                type="button"
              >
                {isSignatureWorkflow ? "Draw / Sign" : "Draw"}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue"
                href={originalPdfUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open original PDF
              </a>
              {savedVariantHref ? (
                <a
                  className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue"
                  href={savedVariantHref}
                  rel="noreferrer"
                  target="_blank"
                >
                  {savedVariantLabel}
                </a>
              ) : null}
            </div>
          </div>

          <p className="text-sm text-slate-500">
            {interactionMode === "navigate"
              ? "Scroll mode is on. Swipe to move through the PDF without adding strokes."
              : "Draw mode is on. Finger and Pencil input will add markup to the page."}
          </p>

          {loadingPdf ? (
            <p className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              <BrandLoader label="Loading PDF pages" size="sm" tone="muted" />
              Loading PDF pages...
            </p>
          ) : null}
          {pdfError ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-600">{pdfError}</p> : null}

          <div className="space-y-4">
            {pages.map((page) => (
              <PdfMarkupPage
                key={page.pageIndex}
                activeColor={activeColor}
                activeWidth={activeWidth}
                disabled={pending || Boolean(pdfError)}
                interactionMode={interactionMode}
                onStrokeComplete={(stroke) => {
                  setAnnotationStrokes((current) => [...current, stroke]);
                }}
                page={page}
                strokes={annotationStrokes.filter((stroke) => stroke.pageIndex === page.pageIndex)}
              />
            ))}
          </div>
        </div>

        <form action={formAction} className="order-1 space-y-4 rounded-[2rem] bg-white p-6 shadow-panel landscape:order-2">
          <input name="inspectionId" type="hidden" value={inspectionId} />
          <input name="documentId" type="hidden" value={inspectionDocument.id} />
          <input name="signatureDataUrl" type="hidden" value="" />
          <input name="annotationData" type="hidden" value={JSON.stringify(annotationPayload)} />

          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Markup workflow</p>
            <h3 className="mt-2 text-2xl font-semibold text-ink">{isSignatureWorkflow ? "Annotate and sign on the PDF" : "Mark up the PDF"}</h3>
            <p className="mt-2 text-sm text-slate-500">
              {isSignatureWorkflow
                ? "Add initials, signatures, checkmarks, notes, or markup directly on the document. The saved signed PDF will be the version used downstream in admin and billing."
                : "Add checkmarks, notes, callouts, or markup directly on the document. The saved annotated PDF will be the preferred version for office review and customer access when enabled."}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-700">Ink tools</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {strokeColorOptions.map((option) => (
                <button
                  key={option.value}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
                    activeColor === option.value ? "border-slateblue bg-white text-slateblue" : "border-slate-200 bg-white text-slate-700"
                  }`}
                  onClick={() => setActiveColor(option.value)}
                  type="button"
                >
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: option.value }} />
                  {option.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {strokeWidthOptions.map((option) => (
                <button
                  key={option.label}
                  className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold ${
                    activeWidth === option.value ? "border-slateblue bg-white text-slateblue" : "border-slate-200 bg-white text-slate-700"
                  }`}
                  onClick={() => setActiveWidth(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                disabled={pending || annotationStrokes.length === 0}
                onClick={() => {
                  setAnnotationStrokes((current) => current.slice(0, -1));
                }}
                type="button"
              >
                Undo last stroke
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                disabled={pending || annotationStrokes.length === 0}
                onClick={() => setAnnotationStrokes([])}
                type="button"
              >
                Clear all markup
              </button>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-700">Markup summary</p>
            <p className="mt-2">{totalStrokeCount === 0 ? "No markup added yet." : `${totalStrokeCount} stroke${totalStrokeCount === 1 ? "" : "s"} captured and ready to save.`}</p>
          </div>

          {!inspectionDocument.requiresSignature ? <p className="text-sm text-slate-500">This document was uploaded as reference-only. Signature is not required, but saved markup will create an annotated PDF variant.</p> : null}
          {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-emerald-600">{state.success}</p> : null}
          <button
            className="w-full rounded-2xl bg-slateblue px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            disabled={pending || totalStrokeCount === 0 || Boolean(pdfError) || loadingPdf}
            type="submit"
          >
            {pending
              ? (isSignatureWorkflow ? "Saving signed PDF..." : "Saving annotated PDF...")
              : (isSignatureWorkflow ? "Save signed PDF" : "Save annotated PDF")}
          </button>
        </form>
      </div>
    </div>
  );
}
