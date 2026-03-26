type SearchParamValue = string | number | boolean | null | undefined;

type SearchParamSource = {
  toString(): string;
};

export function buildSettingsHref(
  pathname: string,
  searchParams: SearchParamSource,
  nextValues: Record<string, SearchParamValue>
) {
  const params = new URLSearchParams(searchParams.toString());

  for (const [key, value] of Object.entries(nextValues)) {
    if (value === null || value === undefined || value === "" || value === false) {
      params.delete(key);
      continue;
    }

    params.set(key, String(value));
  }

  return params.toString() ? `${pathname}?${params.toString()}` : pathname;
}

