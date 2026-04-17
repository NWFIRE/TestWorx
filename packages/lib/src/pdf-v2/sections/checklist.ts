import { ensureSpace, drawSectionTitle, type PageCursor, type PdfV2Runtime } from "../page-shell";
import { renderTableSection } from "./table";
import type { RenderSection } from "../types";

export function renderChecklistSection(runtime: PdfV2Runtime, cursor: PageCursor, section: Extract<RenderSection, { renderer: "checklist" }>) {
  cursor = ensureSpace(runtime, cursor, 120);
  drawSectionTitle(runtime, cursor, section.title, section.description);
  return renderTableSection(runtime, cursor, {
    key: `${section.key}-table`,
    title: "",
    renderer: "table",
    columns: [
      { key: "item", label: "Checklist Item", width: "72%" },
      { key: "result", label: "Result", width: "28%" }
    ],
    rows: section.items.map((item) => ({
      item: { text: item.label },
      result: { text: item.result }
    })),
    emptyMessage: section.emptyMessage,
    repeatHeader: true
  });
}
