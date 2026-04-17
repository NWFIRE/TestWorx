export function pageClassName(className?: string) {
  return ["pdf-shell", className].filter(Boolean).join(" ");
}
