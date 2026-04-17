import type { DividerProps } from "../types/common";

export function Divider({ subtle = false }: DividerProps) {
  return <div className={`pdf-divider${subtle ? " pdf-divider--subtle" : ""}`} />;
}
