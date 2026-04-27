export function mapCustomerFacingReportStatus(input: {
  isFinalized: boolean;
  isSigned: boolean;
  outcome?: "pass" | "fail" | null;
  workflowStatus?: string | null;
}) {
  if (input.isFinalized || input.isSigned) {
    return {
      documentStatus: "Finalized",
      inspectionStatus: "Completed"
    };
  }

  return {
    documentStatus: "Draft",
    inspectionStatus: "To Be Completed"
  };
}

export function getCustomerFacingOutcomeLabel(input: {
  isFinalized: boolean;
  isSigned: boolean;
  deficiencyTotal: number;
  passLabel?: string;
  failLabel?: string;
  deficiencyFoundLabel?: string;
}) {
  const deficiencyLabel = input.deficiencyFoundLabel ?? "Deficiencies Found";
  const passLabel = input.passLabel ?? "Passed";

  if (input.deficiencyTotal > 0) {
    return deficiencyLabel;
  }
  if (input.isFinalized || input.isSigned) {
    return passLabel;
  }
  return "Completed";
}
