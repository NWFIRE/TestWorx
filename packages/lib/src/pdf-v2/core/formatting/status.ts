import { cleanText } from "./text";

function normalizeStatusToken(value: unknown) {
  return cleanText(value)?.toLowerCase().replace(/[\s-]+/g, "_");
}

export function normalizeDocumentStatus(input: unknown): "Finalized" | "Draft" | "Partial" | undefined {
  const token = normalizeStatusToken(input);
  if (!token) {
    return undefined;
  }

  if (["finalized", "complete", "completed", "signed"].includes(token)) {
    return "Finalized";
  }

  if (["partial", "attention"].includes(token)) {
    return "Partial";
  }

  if (["draft", "pending", "scheduled", "in_progress", "inprogress", "to_be_completed"].includes(token)) {
    return "Draft";
  }

  return undefined;
}

export function normalizeResultStatus(input: unknown): "Pass" | "Fail" | "Partial" | undefined {
  const token = normalizeStatusToken(input);
  if (!token) {
    return undefined;
  }

  if (["pass", "passed", "normal", "good", "ok"].includes(token)) {
    return "Pass";
  }

  if (["fail", "failed", "deficiency", "damaged", "repair_required"].includes(token)) {
    return "Fail";
  }

  if (["partial", "attention", "mixed"].includes(token)) {
    return "Partial";
  }

  return undefined;
}

export function resolveFinalCustomerFacingStatus(params: {
  documentStatus?: unknown;
  inspectionStatus?: unknown;
  result?: unknown;
}): {
  documentStatus?: "Finalized" | "Draft" | "Partial";
  result?: "Pass" | "Fail" | "Partial";
} {
  const documentStatus = normalizeDocumentStatus(params.documentStatus ?? params.inspectionStatus);
  const result = normalizeResultStatus(params.result);

  if (documentStatus === "Finalized") {
    return {
      documentStatus: "Finalized",
      result: result ?? "Pass"
    };
  }

  return {
    documentStatus: documentStatus ?? undefined,
    result
  };
}
