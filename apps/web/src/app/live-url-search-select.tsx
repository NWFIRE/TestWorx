"use client";

import { LiveUrlSearchInput } from "./live-url-search-input";
import type { SearchSelectOption } from "./search-select";

// List searches show results in the page, not a second autocomplete list.
// Keep this adapter for existing callers; record pickers still use SearchSelect.
export function LiveUrlSearchSelect(props: {
  id?: string;
  initialValue: string;
  paramKey: string;
  placeholder: string;
  options: SearchSelectOption[];
  emptyText?: string;
  resetPageKeys?: string[];
  className?: string;
}) {
  return <LiveUrlSearchInput id={props.id} initialValue={props.initialValue} paramKey={props.paramKey} placeholder={props.placeholder} resetPageKeys={props.resetPageKeys} className={props.className} />;
}
