"use client";

export function toDateValue(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}
