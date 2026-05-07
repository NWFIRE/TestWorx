"use client";

export const TECHNICIAN_SCREEN_SNAPSHOT_VERSION = 3;
const VERSION_FIELD = "__tradeWorxTechnicianSnapshotVersion";

type VersionedSnapshot<T> = T & {
  [VERSION_FIELD]?: number;
};

export function markTechnicianScreenSnapshot<T>(payload: T): VersionedSnapshot<T> {
  if (!payload || typeof payload !== "object") {
    return payload as VersionedSnapshot<T>;
  }

  return {
    ...(payload as object),
    [VERSION_FIELD]: TECHNICIAN_SCREEN_SNAPSHOT_VERSION
  } as VersionedSnapshot<T>;
}

export function isCurrentTechnicianScreenSnapshot<T>(payload: T | null | undefined) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  return (payload as VersionedSnapshot<T>)[VERSION_FIELD] === TECHNICIAN_SCREEN_SNAPSHOT_VERSION;
}
