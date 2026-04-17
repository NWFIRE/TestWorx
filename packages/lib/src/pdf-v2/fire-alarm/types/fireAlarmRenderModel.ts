export type FireAlarmReportRenderModel = {
  report: {
    title: string;
    reportId: string;
    inspectionDate: string;
    finalizedAt?: string;
    documentStatus?: "Finalized" | "Draft" | "Partial";
    result?: "Pass" | "Fail" | "Partial";
    completionPercent?: number;
    narrative: string;
  };
  company: {
    name: string;
    logoUrl?: string;
    phone?: string;
    email?: string;
    website?: string;
    address?: string;
  };
  compliance: {
    codes: string[];
  };
  identity: {
    customerName: string;
    siteName?: string;
    cleanAddress?: string;
    technicianName?: string;
    billingContact?: string;
    inspectionDate: string;
    completionTimestamp?: string;
    scheduledWindow?: string;
  };
  page1Metadata: Array<{
    label: string;
    value: string;
  }>;
  systemSummary: Array<{
    label: string;
    value: string | number;
    tone?: "default" | "success" | "warning" | "danger";
  }>;
  controlPanelSection: {
    result?: string;
    inspected?: number;
    deficiencies?: number;
    detailFields: Array<{ label: string; value: string }>;
    rows: Array<{
      location?: string;
      type?: string;
      manufacturer?: string;
      serviceKey?: string;
      inspectionSummary?: string[];
      notes?: string;
    }>;
  };
  initiatingDevicesSection: {
    result?: string;
    inspected?: number;
    deficiencies?: number;
    rows: Array<{
      location?: string;
      deviceType: string;
      functionalTest?: string;
      physicalCondition?: string;
      manufacturer?: string;
      notes?: string;
    }>;
  };
  notificationAppliancesSection: {
    result?: string;
    inspected?: number;
    deficiencies?: number;
    rows: Array<{
      location?: string;
      applianceType: string;
      quantity?: number;
      audibleOperation?: string;
      visibleOperation?: string;
      notes?: string;
    }>;
  };
  findings: string[];
  deficiencies: Array<{
    title?: string;
    description: string;
    severity?: string;
    action?: string;
  }>;
  notes?: string;
  photos: Array<{
    url: string;
    caption: string;
  }>;
  signatures: {
    technician?: {
      name: string;
      signedAt?: string;
      imageUrl: string;
    };
    customer?: {
      name: string;
      signedAt?: string;
      imageUrl: string;
    };
  };
};
