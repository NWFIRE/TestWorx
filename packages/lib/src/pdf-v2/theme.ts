import { rgb } from "pdf-lib";

function hexToRgb(hex: string, fallback: { r: number; g: number; b: number }) {
  const normalized = hex.replace("#", "").trim();
  if (![3, 6].includes(normalized.length)) {
    return rgb(fallback.r, fallback.g, fallback.b);
  }

  const expanded = normalized.length === 3 ? normalized.split("").map((char) => `${char}${char}`).join("") : normalized;
  const value = Number.parseInt(expanded, 16);
  if (Number.isNaN(value)) {
    return rgb(fallback.r, fallback.g, fallback.b);
  }

  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

export type PdfV2Theme = {
  primary: ReturnType<typeof rgb>;
  accent: ReturnType<typeof rgb>;
  ink: ReturnType<typeof rgb>;
  muted: ReturnType<typeof rgb>;
  softText: ReturnType<typeof rgb>;
  line: ReturnType<typeof rgb>;
  surface: ReturnType<typeof rgb>;
  softSurface: ReturnType<typeof rgb>;
  passBg: ReturnType<typeof rgb>;
  passText: ReturnType<typeof rgb>;
  failBg: ReturnType<typeof rgb>;
  failText: ReturnType<typeof rgb>;
  warnBg: ReturnType<typeof rgb>;
  warnText: ReturnType<typeof rgb>;
};

export function buildPdfV2Theme(primaryHex?: string | null, accentHex?: string | null): PdfV2Theme {
  return {
    primary: hexToRgb(primaryHex ?? "#1E3A5F", { r: 0.12, g: 0.23, b: 0.37 }),
    accent: hexToRgb(accentHex ?? "#C2410C", { r: 0.76, g: 0.25, b: 0.05 }),
    ink: rgb(0.09, 0.13, 0.19),
    muted: rgb(0.31, 0.36, 0.43),
    softText: rgb(0.5, 0.56, 0.63),
    line: rgb(0.86, 0.9, 0.94),
    surface: rgb(1, 1, 1),
    softSurface: rgb(0.972, 0.979, 0.987),
    passBg: rgb(0.93, 0.975, 0.947),
    passText: rgb(0.11, 0.41, 0.24),
    failBg: rgb(0.993, 0.948, 0.944),
    failText: rgb(0.6, 0.17, 0.16),
    warnBg: rgb(0.994, 0.972, 0.91),
    warnText: rgb(0.56, 0.39, 0.04)
  };
}
