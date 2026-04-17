import type { EmptyStateProps } from "../types/common";

export function EmptyState({ message }: EmptyStateProps) {
  return <p className="pdf-empty-state">{message}</p>;
}
