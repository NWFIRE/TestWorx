type InspectionTypeItem = {
  id?: string | null;
  key?: string | null;
  label?: string | null;
};

const typeColorClasses = {
  fireAlarm: "text-red-700",
  kitchenSuppression: "text-emerald-700",
  fireExtinguisher: "text-blue-700",
  sprinkler: "text-teal-700",
  emergencyLighting: "text-orange-700",
  backflow: "text-purple-700",
  firePump: "text-amber-700",
  specialHazard: "text-slate-700",
  hoodExhaust: "text-[color:#8B5A2B]",
  workOrder: "text-slate-600"
} as const;

function humanizeInspectionType(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getInspectionTypeTextColorClass(typeOrLabel: string | null | undefined) {
  const normalized = (typeOrLabel ?? "").toLowerCase().replaceAll("_", " ");

  if (normalized.includes("kitchen") || normalized.includes("wet chemical")) {
    return typeColorClasses.kitchenSuppression;
  }

  if (normalized.includes("fire alarm") || normalized === "alarm") {
    return typeColorClasses.fireAlarm;
  }

  if (normalized.includes("extinguisher")) {
    return typeColorClasses.fireExtinguisher;
  }

  if (normalized.includes("sprinkler")) {
    return typeColorClasses.sprinkler;
  }

  if (normalized.includes("emergency") || normalized.includes("exit") || normalized.includes("lighting")) {
    return typeColorClasses.emergencyLighting;
  }

  if (normalized.includes("backflow")) {
    return typeColorClasses.backflow;
  }

  if (normalized.includes("pump")) {
    return typeColorClasses.firePump;
  }

  if (normalized.includes("hood") || normalized.includes("exhaust")) {
    return typeColorClasses.hoodExhaust;
  }

  if (normalized.includes("industrial") || normalized.includes("special hazard") || normalized.includes("dry chemical")) {
    return typeColorClasses.specialHazard;
  }

  if (normalized.includes("work order") || normalized.includes("service call") || normalized === "service") {
    return typeColorClasses.workOrder;
  }

  return typeColorClasses.workOrder;
}

export function InspectionTypeInlineList({
  fallback = "Inspection workflow",
  types
}: {
  fallback?: string;
  types: InspectionTypeItem[];
}) {
  const displayTypes = types
    .map((type) => {
      const source = type.key?.trim() || type.label?.trim() || "";
      const label = type.label?.trim() || (type.key ? humanizeInspectionType(type.key) : "");

      return {
        colorClassName: getInspectionTypeTextColorClass(source || label),
        id: type.id?.trim() || `${source}-${label}`,
        label
      };
    })
    .filter((type) => type.label.length > 0);

  if (displayTypes.length === 0) {
    return (
      <p className="mt-1 text-sm font-semibold leading-5 text-slate-600">
        {fallback}
      </p>
    );
  }

  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold leading-5">
      {displayTypes.map((type, index) => (
        <span key={type.id} className="inline-flex items-center gap-x-2">
          {index > 0 ? <span className="text-xs font-medium text-[color:var(--text-tertiary)]">•</span> : null}
          <span className={type.colorClassName}>{type.label}</span>
        </span>
      ))}
    </p>
  );
}
