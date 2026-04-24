"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type NotificationPriority = "normal" | "high" | "urgent";
type NotificationType =
  | "priority_inspection_assigned"
  | "inspection_reissued_for_correction"
  | "work_order_reassigned"
  | "inspection_overdue"
  | "sync_attention_required";

export type TechnicianNotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
  createdAt: string;
  isRead: boolean;
  href: string;
  relatedEntityType: "work_order" | "inspection" | "report" | "sync_item";
  relatedEntityId: string;
};

type TechnicianNotificationSummary = {
  items: TechnicianNotificationItem[];
  counts: {
    total: number;
    iconBadge: number;
    work: number;
    inspections: number;
  };
  lastUpdatedAt: string;
};

type TechnicianNotificationContextValue = TechnicianNotificationSummary & {
  refresh: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  dismiss: (notificationId: string) => Promise<void>;
};

const STORAGE_KEY = "tradeworx-technician-notifications";

const emptySummary: TechnicianNotificationSummary = {
  items: [],
  counts: {
    total: 0,
    iconBadge: 0,
    work: 0,
    inspections: 0
  },
  lastUpdatedAt: ""
};

const TechnicianNotificationContext = createContext<TechnicianNotificationContextValue | null>(null);

function isInspectionBadgeType(type: NotificationType) {
  return type === "inspection_reissued_for_correction";
}

function recalculateCounts(items: TechnicianNotificationItem[]) {
  const unread = items.filter((item) => !item.isRead);
  return {
    total: unread.length,
    iconBadge: unread.length,
    work: unread.filter((item) => !isInspectionBadgeType(item.type)).length,
    inspections: unread.filter((item) => isInspectionBadgeType(item.type)).length
  };
}

function persistSummary(summary: TechnicianNotificationSummary) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(summary));
  } catch {
    // Ignore storage failures so field workflow keeps moving.
  }
}

function readStoredSummary() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as TechnicianNotificationSummary;
    if (!parsed || !Array.isArray(parsed.items) || !parsed.counts) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function loadSummary(): Promise<TechnicianNotificationSummary> {
  const response = await fetch("/api/tech/notifications", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin"
  });

  if (!response.ok) {
    throw new Error("Unable to load technician notifications.");
  }

  return response.json() as Promise<TechnicianNotificationSummary>;
}

async function postNotificationMutation(path: string, notificationId: string) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    body: JSON.stringify({ notificationId })
  });

  if (!response.ok) {
    throw new Error("Unable to update technician notification.");
  }
}

export function TechnicianNotificationProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const [summary, setSummary] = useState<TechnicianNotificationSummary>(() => {
    if (typeof window === "undefined") {
      return emptySummary;
    }

    return readStoredSummary() ?? emptySummary;
  });
  const refresh = useCallback(async () => {
    try {
      const next = await loadSummary();
      setSummary(next);
      persistSummary(next);
    } catch {
      const stored = readStoredSummary();
      if (stored) {
        setSummary(stored);
      }
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  const markRead = useCallback(async (notificationId: string) => {
    setSummary((current) => {
      const items = current.items.map((item) => item.id === notificationId ? { ...item, isRead: true } : item);
      const next = {
        ...current,
        items,
        counts: recalculateCounts(items),
        lastUpdatedAt: new Date().toISOString()
      };
      persistSummary(next);
      return next;
    });

    try {
      await postNotificationMutation("/api/tech/notifications/read", notificationId);
      await refresh();
    } catch {
      // Keep optimistic state. A later refresh will reconcile.
    }
  }, [refresh]);

  const dismiss = useCallback(async (notificationId: string) => {
    setSummary((current) => {
      const items = current.items.filter((item) => item.id !== notificationId);
      const next = {
        ...current,
        items,
        counts: recalculateCounts(items),
        lastUpdatedAt: new Date().toISOString()
      };
      persistSummary(next);
      return next;
    });

    try {
      await postNotificationMutation("/api/tech/notifications/dismiss", notificationId);
      await refresh();
    } catch {
      // Keep optimistic state. A later refresh will reconcile.
    }
  }, [refresh]);

  const value = useMemo<TechnicianNotificationContextValue>(() => ({
    ...summary,
    refresh,
    markRead,
    dismiss
  }), [dismiss, markRead, refresh, summary]);

  return (
    <TechnicianNotificationContext.Provider value={value}>
      {children}
    </TechnicianNotificationContext.Provider>
  );
}

export function useTechnicianNotifications() {
  const context = useContext(TechnicianNotificationContext);
  if (!context) {
    throw new Error("useTechnicianNotifications must be used within TechnicianNotificationProvider.");
  }

  return context;
}

export function TechnicianNotificationQueryBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { markRead } = useTechnicianNotifications();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const notificationId = searchParams.get("notification");
    if (!notificationId || handled.current === notificationId) {
      return;
    }

    handled.current = notificationId;
    void markRead(notificationId).finally(() => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("notification");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }, [markRead, pathname, router, searchParams]);

  return null;
}
