export type TechnicianMobileTaskStatusLabel =
  | "Not Started"
  | "In Progress"
  | "Ready for Review"
  | "Finalized";

export type TechnicianMobileTaskWorkspaceSummary = {
  id: string;
  displayLabel: string;
  reportStatus: "draft" | "submitted" | "finalized" | null;
  hasMeaningfulProgress?: boolean;
  progressCompletedCount?: number | null;
  progressTotalCount?: number | null;
  progressPercent?: number | null;
  isCurrent?: boolean;
};

type TaskLike = {
  report?: {
    status?: "draft" | "submitted" | "finalized" | null;
  } | null;
};

export function getTechnicianMobileTaskStatusLabel(input: {
  reportStatus: "draft" | "submitted" | "finalized" | null | undefined;
  hasMeaningfulProgress?: boolean;
}): TechnicianMobileTaskStatusLabel {
  if (input.reportStatus === "finalized") {
    return "Finalized";
  }

  if (input.reportStatus === "submitted") {
    return "Ready for Review";
  }

  if (input.reportStatus === "draft") {
    return input.hasMeaningfulProgress === false ? "Not Started" : "In Progress";
  }

  return "Not Started";
}

export function buildSafeTaskProgressSummary(input: {
  completedCount?: number | null;
  totalCount?: number | null;
  percent?: number | null;
}) {
  const completedCount = typeof input.completedCount === "number" ? input.completedCount : null;
  const totalCount = typeof input.totalCount === "number" ? input.totalCount : null;
  const percent = typeof input.percent === "number" ? input.percent : null;

  if (
    completedCount === null ||
    totalCount === null ||
    totalCount <= 0 ||
    completedCount < 0 ||
    completedCount > totalCount
  ) {
    return null;
  }

  return {
    completedCount,
    totalCount,
    percent: percent !== null && percent >= 0 && percent <= 100
      ? percent
      : Math.round((completedCount / totalCount) * 100),
    label: `${completedCount} of ${totalCount} complete`
  };
}

export function summarizeTechnicianTaskStatuses(tasks: TaskLike[]) {
  const summary = {
    total: tasks.length,
    notStarted: 0,
    inProgress: 0,
    readyForReview: 0,
    finalized: 0
  };

  for (const task of tasks) {
    const status = getTechnicianMobileTaskStatusLabel({
      reportStatus: task.report?.status ?? null
    });

    if (status === "Not Started") {
      summary.notStarted += 1;
    } else if (status === "In Progress") {
      summary.inProgress += 1;
    } else if (status === "Ready for Review") {
      summary.readyForReview += 1;
    } else if (status === "Finalized") {
      summary.finalized += 1;
    }
  }

  return summary;
}

export function buildInspectionTaskSummaryLine(tasks: TaskLike[]) {
  const summary = summarizeTechnicianTaskStatuses(tasks);

  if (summary.total <= 1) {
    return null;
  }

  const parts: string[] = [];
  if (summary.inProgress > 0) {
    parts.push(`${summary.inProgress} in progress`);
  }
  if (summary.readyForReview > 0) {
    parts.push(`${summary.readyForReview} ready for review`);
  }
  if (summary.notStarted > 0) {
    parts.push(`${summary.notStarted} not started`);
  }
  if (summary.finalized > 0) {
    parts.push(`${summary.finalized} finalized`);
  }

  if (parts.length === 0) {
    return `${summary.total} reports assigned`;
  }

  return `${summary.total} reports assigned • ${parts.join(" • ")}`;
}
