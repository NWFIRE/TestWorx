export function getSearchMenuLayout({ top, bottom, viewportWidth, viewportHeight, contentTop = 0 }: {
  top: number;
  bottom: number;
  viewportWidth: number;
  viewportHeight: number;
  contentTop?: number;
}) {
  if (viewportWidth < 768) return undefined;
  const below = Math.max(0, viewportHeight - bottom - 16);
  const above = Math.max(0, top - Math.max(0, contentTop) - 16);
  const upward = below < 160 && above > below;
  return {
    maxHeight: Math.min(288, upward ? above : below),
    top: upward ? "auto" : "100%",
    bottom: upward ? "calc(100% + 8px)" : "auto",
    marginTop: upward ? 0 : 8
  };
}
