export function formatYesNo(value: unknown): string | undefined {
  if (value === true || value === "true" || value === "yes" || value === "pass") {
    return "Yes";
  }

  if (value === false || value === "false" || value === "no" || value === "fail") {
    return "No";
  }

  return undefined;
}
