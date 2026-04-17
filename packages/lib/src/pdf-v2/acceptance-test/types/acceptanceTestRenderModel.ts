export type AcceptanceTestRenderModel = {
  report: {
    title: "Wet Chemical System Acceptance Test Report";
    standard: "NFPA 17A";
    result: "Pass" | "Fail" | "Partial";
    completionDate?: string;
    narrative: string;
    reportId?: string;
    assignedTo?: string;
    status?: "Draft" | "Assigned" | "In Progress" | "Finalized";
  };
  company: {
    name: string;
    logoUrl?: string;
    addressLine1?: string;
    cityStateZip?: string;
    phone?: string;
    email?: string;
    website?: string;
    licenseNumber?: string;
  };
  property: {
    buildingName?: string;
    address?: string;
    buildingOwner?: string;
    ownerContact?: string;
  };
  installer: {
    companyName: string;
    address?: string;
    contactPerson?: string;
    contactInfo?: string;
    licenseNumber?: string;
  };
  system: {
    hazardDescription?: string;
    manufacturer?: string;
    model?: string;
    dateLeftInService?: string;
  };
  tests: Array<{
    key: string;
    label: string;
    code?: string;
    result: "Pass" | "Fail" | "Yes" | "No";
    displayResult: "Pass" | "Fail";
    category?: string;
  }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  witness: {
    witnessedBy?: string;
  };
  comments?: string;
  signatures: {
    authorizedAgent?: {
      name: string;
      title?: string;
      signedAt?: string;
      imageUrl?: string;
    };
    installingContractor?: {
      name: string;
      title?: string;
      signedAt?: string;
      imageUrl?: string;
    };
  };
};
