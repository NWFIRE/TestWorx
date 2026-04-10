"use client";

import { useState } from "react";
import { useToast } from "@/app/toast-provider";
import { ActionButton } from "@/app/action-button";

export function CopyQuoteLinkButton({
  href
}: {
  href: string;
}) {
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      showToast({ title: "Hosted quote link copied", tone: "success" });
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
      showToast({ title: "Unable to copy link", tone: "error" });
    }
  }

  return (
    <ActionButton onClick={handleCopy}>
      {copied ? "Link copied" : "Copy hosted link"}
    </ActionButton>
  );
}
