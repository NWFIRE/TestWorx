"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

export function AttentionLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} prefetch={false} onClick={(event) => {
    // Preserve this history entry, not a global scroll position or a new tab.
    if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      const main = event.currentTarget.closest("main");
      if (main) window.history.replaceState({ ...window.history.state, attentionDashboardScroll: main.scrollTop }, "");
    }
  }} />;
}
