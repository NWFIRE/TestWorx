import type { BadgeProps } from "../types/common";

const toneMap: Record<NonNullable<BadgeProps["tone"]>, string> = {
  default: "pdf-bg-muted",
  success: "pdf-bg-success pdf-tone-success",
  warning: "pdf-bg-warning pdf-tone-warning",
  danger: "pdf-bg-danger pdf-tone-danger",
  muted: "pdf-bg-muted pdf-muted"
};

export function Badge({ children, tone = "default" }: BadgeProps) {
  return <span className={`pdf-badge ${toneMap[tone]}`}>{children}</span>;
}
