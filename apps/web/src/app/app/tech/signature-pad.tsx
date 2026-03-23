"use client";

import { useEffect, useRef, useState } from "react";

export function SignaturePad({
  label,
  signerName,
  onSignerNameChange,
  value,
  onChange,
  disabled
}: {
  label: string;
  signerName: string;
  onSignerNameChange: (value: string) => void;
  value?: string;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasStroke, setHasStroke] = useState(Boolean(value));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      setHasStroke(true);
    };
    image.src = value;
  }, [value]);

  function positionForEvent(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * event.currentTarget.width,
      y: ((event.clientY - rect.top) / rect.height) * event.currentTarget.height
    };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    drawingRef.current = true;
    const point = positionForEvent(event);
    context.lineWidth = 2;
    context.lineCap = "round";
    context.strokeStyle = "#0F172A";
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || disabled) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    const point = positionForEvent(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    setHasStroke(true);
  }

  function finishDrawing() {
    if (disabled) {
      return;
    }

    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke) {
      return;
    }

    onChange(canvas.toDataURL("image/png"));
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || disabled) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
    onChange(null);
  }

  return (
    <div className="space-y-3 rounded-[1.5rem] border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-base font-semibold text-ink">{label}</h4>
        <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 disabled:opacity-50" disabled={disabled} onClick={clearSignature} type="button">
          Clear
        </button>
      </div>
      <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 uppercase" disabled={disabled} onChange={(event) => onSignerNameChange(event.target.value)} placeholder="Signer name" value={signerName} />
      <canvas
        ref={canvasRef}
        className="h-40 w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 touch-none"
        height={180}
        onPointerDown={startDrawing}
        onPointerLeave={finishDrawing}
        onPointerMove={draw}
        onPointerUp={finishDrawing}
        width={600}
      />
    </div>
  );
}
