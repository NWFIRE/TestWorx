"use client";

import { useState } from "react";

export function CopyQuoteLinkButton({
  href
}: {
  href: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      onClick={handleCopy}
      type="button"
    >
      {copied ? "Link copied" : "Copy hosted link"}
    </button>
  );
}
