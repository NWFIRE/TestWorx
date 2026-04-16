"use client";

import { useEffect, useState } from "react";

type PlanningMonth = {
  monthKey: string;
  monthLabel: string;
};

function getMonthSectionId(monthKey: string) {
  return `planning-month-${monthKey}`;
}

export function PlanningMonthJumpBar({
  months,
  initialMonthKey
}: {
  months: PlanningMonth[];
  initialMonthKey?: string;
}) {
  const fallbackMonthKey = months[0]?.monthKey ?? "";
  const [activeMonthKey, setActiveMonthKey] = useState(
    initialMonthKey && months.some((month) => month.monthKey === initialMonthKey) ? initialMonthKey : fallbackMonthKey
  );

  useEffect(() => {
    if (!activeMonthKey) {
      return;
    }

    const hash = `#${getMonthSectionId(activeMonthKey)}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }, [activeMonthKey]);

  return (
    <>
      {months.map((month) => {
        const active = activeMonthKey === month.monthKey;

        return (
          <button
            key={month.monthKey}
            className={`pressable pressable-row inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
              active
                ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary)] text-[var(--tenant-primary-contrast)]"
                : "border-[color:var(--border-default)] bg-[color:var(--surface-base)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-subtle)]"
            }`}
            onClick={() => {
              setActiveMonthKey(month.monthKey);
              document.getElementById(getMonthSectionId(month.monthKey))?.scrollIntoView({
                behavior: "smooth",
                block: "start"
              });
            }}
            type="button"
          >
            {month.monthLabel}
          </button>
        );
      })}
    </>
  );
}
