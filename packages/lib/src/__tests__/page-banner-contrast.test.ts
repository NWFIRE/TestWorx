import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../../../apps/web/src/app/app/page-banner.module.css", import.meta.url), "utf8");
function luminance(hex: string) {
  const channels = hex.replace("#", "").match(/.{2}/g)!.map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}
describe("page banner contrast", () => {
  it("keeps title and supporting text readable across the full blue gradient", () => {
    const stops = css.match(/linear-gradient\(110deg, (#[\da-f]{6}), (#[\da-f]{6})\)/i)!;
    expect(stops).toBeTruthy();
    for (const background of stops.slice(1)) {
      expect(contrast("#ffffff", background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast("#e2edfa", background)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("gives dark and brand-colored header actions a light surface", () => {
    const actions = css.match(/\.banner \.actions\s*\{([^}]+)\}/)![1]!;
    const background = actions.match(/background:\s*(#[\da-f]{6})/)![1]!;
    for (const foreground of ["#142238", "#334155", "#2f68b2"]) {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(background, "#2563a6")).toBeGreaterThanOrEqual(3);
  });
});
