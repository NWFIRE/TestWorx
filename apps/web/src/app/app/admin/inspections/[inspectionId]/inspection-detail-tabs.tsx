"use client";

import { useEffect, useState, type ReactNode } from "react";

type InspectionDetailTabId = "overview" | "report" | "documents" | "scheduling" | "activity";

const tabs: Array<{ id: InspectionDetailTabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "report", label: "Report" },
  { id: "documents", label: "Documents" },
  { id: "scheduling", label: "Scheduling" },
  { id: "activity", label: "Activity" }
];

export function InspectionDetailTabs({
  overview,
  report,
  documents,
  scheduling,
  activity
}: Record<InspectionDetailTabId, ReactNode>) {
  const [activeTab, setActiveTab] = useState<InspectionDetailTabId>("overview");
  const panels: Record<InspectionDetailTabId, ReactNode> = {
    overview,
    report,
    documents,
    scheduling,
    activity
  };

  useEffect(() => {
    const syncTabFromHash = () => {
      const hashTab = window.location.hash.replace("#", "") as InspectionDetailTabId;
      if (tabs.some((tab) => tab.id === hashTab)) {
        setActiveTab(hashTab);
      }
    };

    syncTabFromHash();
    window.addEventListener("hashchange", syncTabFromHash);
    return () => window.removeEventListener("hashchange", syncTabFromHash);
  }, []);

  return (
    <div className="rounded-[2rem] border border-[color:rgb(203_215_230_/_0.92)] bg-white shadow-panel">
      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 px-4 py-3 sm:px-6">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              aria-selected={isActive}
              className={`min-h-11 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                isActive
                  ? "bg-slate-950 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                window.history.replaceState(null, "", `#${tab.id}`);
              }}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="p-4 sm:p-6" role="tabpanel">
        {panels[activeTab]}
      </div>
    </div>
  );
}
