export type AcceptanceTestDefinition = {
  key: string;
  label: string;
  code?: string;
};

export const acceptanceTestInstallerDefaults = {
  companyName: "Northwest Fire & Safety",
  cityState: "Enid, Oklahoma",
  phone: "(580) 540-3119",
  website: "www.nwfireandsafety.com",
  licenseNumber: "OK #466"
} as const;

export const acceptanceTestDefinitions: readonly AcceptanceTestDefinition[] = [
  {
    key: "installationApprovedPlans",
    label: "Installation in accordance with approved plans, where required, and manufacturer's design, installation, and maintenance manual"
  },
  {
    key: "pipingTest",
    label: "Piping Test",
    code: "6.4.4.2"
  },
  {
    key: "properLabeling",
    label: "Proper Labeling",
    code: "6.4.5"
  },
  {
    key: "properAlarmOperation",
    label: "Proper Alarm Operation",
    code: "6.4.6"
  },
  {
    key: "manualReleaseAccessibility",
    label: "Manual Release Accessibility",
    code: "6.4.7"
  },
  {
    key: "releasingControlPanel",
    label: "Releasing Control Panel",
    code: "6.4.9"
  },
  {
    key: "automaticDetectionAndManualRelease",
    label: "Automatic Detection & Manual Release",
    code: "6.4.8"
  },
  {
    key: "systemProperlyChargedAndSet",
    label: "System Properly Charged And Left In Normal \"Set\" Condition",
    code: "6.4.10"
  },
  {
    key: "manualLeftWithOwner",
    label: "Manual Left With Owner",
    code: "6.4.10.4"
  }
];

export type AcceptanceTestKey = AcceptanceTestDefinition["key"];
