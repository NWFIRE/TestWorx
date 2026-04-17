import "server-only";

import { AttachmentKind, AttachmentSource, Prisma } from "@prisma/client";
import { prisma } from "@testworx/db";
import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import {
  type CreateManualInput,
  createManualInputSchema,
  type ListManualsInput,
  listManualsInputSchema,
  type ManualDocumentType,
  type ManualSystemCategory,
  type UpdateManualInput,
  updateManualInputSchema
} from "./manuals-shared";
import { assertTenantContext } from "./permissions";
import { buildFileDownloadResponse, buildStoredFilePayload } from "./storage";

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function ensureInternalAccess(actor: ReturnType<typeof parseActor>) {
  if (!["platform_admin", "tenant_admin", "office_admin", "technician"].includes(actor.role)) {
    throw new Error("Only internal users can access manuals.");
  }
}

function ensureAdminAccess(actor: ReturnType<typeof parseActor>) {
  if (!["platform_admin", "tenant_admin", "office_admin"].includes(actor.role)) {
    throw new Error("Only administrators can manage manuals.");
  }
}

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function parseRevisionDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function scoreManualMatch(
  manual: {
    title: string;
    manufacturer: string;
    productFamily: string | null;
    model: string | null;
    tags: string[];
    searchableText: string | null;
  },
  query: string
) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const title = normalizeText(manual.title);
  const manufacturer = normalizeText(manual.manufacturer);
  const productFamily = normalizeText(manual.productFamily);
  const model = normalizeText(manual.model);
  const searchableText = normalizeText(manual.searchableText);
  const tags = manual.tags.map((tag) => normalizeText(tag));

  let score = 0;
  if (title.includes(normalizedQuery)) {
    score += 100;
  }
  if (manufacturer.includes(normalizedQuery)) {
    score += 60;
  }
  if (productFamily.includes(normalizedQuery) || model.includes(normalizedQuery)) {
    score += 55;
  }
  if (tags.some((tag) => tag.includes(normalizedQuery))) {
    score += 35;
  }
  if (searchableText.includes(normalizedQuery)) {
    score += 15;
  }

  return score;
}

function buildSearchWhere(query: string | undefined) {
  if (!query) {
    return undefined;
  }

  const tokens = query
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return undefined;
  }

  return {
    OR: tokens.flatMap((token) => [
      { title: { contains: token, mode: Prisma.QueryMode.insensitive } },
      { manufacturer: { contains: token, mode: Prisma.QueryMode.insensitive } },
      { productFamily: { contains: token, mode: Prisma.QueryMode.insensitive } },
      { model: { contains: token, mode: Prisma.QueryMode.insensitive } },
      { searchableText: { contains: token, mode: Prisma.QueryMode.insensitive } },
      { tags: { has: token } }
    ])
  } satisfies Prisma.ManualWhereInput;
}

type ManualSummaryRecord = Prisma.ManualGetPayload<{
  include: {
    userStates: true;
  };
}>;

function buildManualSummary(manual: ManualSummaryRecord) {
  const userState = manual.userStates[0] ?? null;

  return {
    id: manual.id,
    title: manual.title,
    manufacturer: manual.manufacturer,
    systemCategory: manual.systemCategory as ManualSystemCategory,
    productFamily: manual.productFamily,
    model: manual.model,
    documentType: manual.documentType as ManualDocumentType,
    revisionLabel: manual.revisionLabel,
    revisionDate: manual.revisionDate,
    description: manual.description,
    tags: manual.tags,
    fileName: manual.fileName,
    mimeType: manual.mimeType,
    fileSizeBytes: manual.fileSizeBytes,
    pageCount: manual.pageCount,
    isActive: manual.isActive,
    isOfflineEligible: manual.isOfflineEligible,
    source: manual.source,
    searchableTextStatus: manual.searchableTextStatus,
    isFavorite: userState?.isFavorite ?? false,
    lastViewedAt: userState?.lastViewedAt ?? null,
    savedOfflineAt: userState?.savedOfflineAt ?? null
  };
}

async function getManualRecord(actor: ReturnType<typeof parseActor>, manualId: string) {
  const manual = await prisma.manual.findFirst({
    where: {
      id: manualId,
      tenantId: actor.tenantId as string
    },
    include: {
      applicability: true,
      file: true,
      supersedesManual: {
        select: {
          id: true,
          title: true,
          revisionLabel: true
        }
      },
      supersededManuals: {
        select: {
          id: true,
          title: true,
          revisionLabel: true
        }
      },
      userStates: actor.role === "customer_user"
        ? false
        : {
            where: {
              userId: actor.userId
            }
          }
    }
  });

  if (!manual) {
    throw new Error("Manual not found.");
  }

  if (!manual.isActive && actor.role === "technician") {
    throw new Error("This manual is no longer active.");
  }

  return manual;
}

export async function listManuals(actor: ActorContext, input: Partial<ListManualsInput> = {}) {
  const parsedActor = parseActor(actor);
  ensureInternalAccess(parsedActor);
  const parsedInput = listManualsInputSchema.parse(input);

  const manuals = await prisma.manual.findMany({
    where: {
      tenantId: parsedActor.tenantId as string,
      systemCategory: parsedInput.systemCategory,
      manufacturer: parsedInput.manufacturer
        ? { contains: parsedInput.manufacturer, mode: Prisma.QueryMode.insensitive }
        : undefined,
      model: parsedInput.model
        ? { contains: parsedInput.model, mode: Prisma.QueryMode.insensitive }
        : undefined,
      documentType: parsedInput.documentType,
      isActive: parsedActor.role === "technician"
        ? true
        : parsedInput.isActive,
      ...(buildSearchWhere(parsedInput.query) ?? {}),
      userStates: parsedInput.favoritesOnly || parsedInput.recentOnly
        ? {
            some: {
              userId: parsedActor.userId,
              ...(parsedInput.favoritesOnly ? { isFavorite: true } : {}),
              ...(parsedInput.recentOnly ? { lastViewedAt: { not: null } } : {})
            }
          }
        : undefined
    },
    include: {
      userStates: {
        where: {
          userId: parsedActor.userId
        }
      }
    },
    orderBy: [
      { manufacturer: "asc" },
      { title: "asc" }
    ],
    take: parsedInput.limit ?? 100
  });

  const sorted = [...manuals].sort((left, right) => {
    const queryScoreDiff = scoreManualMatch(right, parsedInput.query ?? "") - scoreManualMatch(left, parsedInput.query ?? "");
    if (queryScoreDiff !== 0) {
      return queryScoreDiff;
    }

    return left.title.localeCompare(right.title);
  });

  return sorted.map(buildManualSummary);
}

export async function listFavoriteManuals(actor: ActorContext, limit = 6) {
  return listManuals(actor, { favoritesOnly: true, limit });
}

export async function listRecentManuals(actor: ActorContext, limit = 6) {
  const parsedActor = parseActor(actor);
  ensureInternalAccess(parsedActor);

  const states = await prisma.userManualState.findMany({
    where: {
      userId: parsedActor.userId,
      lastViewedAt: { not: null },
      manual: {
        tenantId: parsedActor.tenantId as string,
        ...(parsedActor.role === "technician" ? { isActive: true } : {})
      }
    },
    include: {
      manual: {
        include: {
          userStates: {
            where: {
              userId: parsedActor.userId
            }
          }
        }
      }
    },
    orderBy: {
      lastViewedAt: "desc"
    },
    take: limit
  });

  return states.map((state) => buildManualSummary({
    ...state.manual,
    userStates: state.manual.userStates
  }));
}

export async function getManualById(actor: ActorContext, manualId: string) {
  const parsedActor = parseActor(actor);
  ensureInternalAccess(parsedActor);
  const manual = await getManualRecord(parsedActor, manualId);
  return {
    ...buildManualSummary(manual),
    notes: manual.notes,
    searchableText: manual.searchableText,
    applicability: manual.applicability,
    supersedesManual: manual.supersedesManual,
    supersededManuals: manual.supersededManuals
  };
}

export async function getManualLibraryData(actor: ActorContext, input: Partial<ListManualsInput> = {}) {
  const parsedActor = parseActor(actor);
  ensureInternalAccess(parsedActor);

  const [favorites, recent, manuals, manufacturers, models] = await Promise.all([
    listFavoriteManuals(actor, 6),
    listRecentManuals(actor, 6),
    listManuals(actor, input),
    prisma.manual.findMany({
      where: {
        tenantId: parsedActor.tenantId as string,
        ...(parsedActor.role === "technician" ? { isActive: true } : {})
      },
      select: { manufacturer: true },
      distinct: ["manufacturer"],
      orderBy: { manufacturer: "asc" }
    }),
    prisma.manual.findMany({
      where: {
        tenantId: parsedActor.tenantId as string,
        model: { not: null },
        ...(parsedActor.role === "technician" ? { isActive: true } : {})
      },
      select: { model: true },
      distinct: ["model"],
      orderBy: { model: "asc" }
    })
  ]);

  return {
    canManage: ["platform_admin", "tenant_admin", "office_admin"].includes(parsedActor.role),
    favorites,
    recent,
    manuals,
    filterOptions: {
      manufacturers: manufacturers.map((item) => item.manufacturer).filter(Boolean),
      models: models.map((item) => item.model).filter((value): value is string => Boolean(value))
    }
  };
}

export async function uploadManualFile(
  actor: ActorContext,
  input: {
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
  }
) {
  const parsedActor = parseActor(actor);
  ensureAdminAccess(parsedActor);

  const stored = await buildStoredFilePayload({
    tenantId: parsedActor.tenantId as string,
    category: "manual",
    fileName: input.fileName,
    mimeType: input.mimeType,
    bytes: input.bytes
  });

  return prisma.attachment.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      kind: input.mimeType === "application/pdf" ? AttachmentKind.pdf : AttachmentKind.file,
      source: AttachmentSource.uploaded,
      fileName: stored.fileName,
      mimeType: stored.mimeType,
      storageKey: stored.storageKey,
      customerVisible: false
    }
  });
}

async function getManualFileForCreate(actor: ReturnType<typeof parseActor>, fileId: string) {
  const file = await prisma.attachment.findFirst({
    where: {
      id: fileId,
      tenantId: actor.tenantId as string
    }
  });

  if (!file) {
    throw new Error("Manual file not found.");
  }

  return file;
}

export async function createManual(actor: ActorContext, input: CreateManualInput) {
  const parsedActor = parseActor(actor);
  ensureAdminAccess(parsedActor);
  const parsedInput = createManualInputSchema.parse(input);
  const file = await getManualFileForCreate(parsedActor, parsedInput.fileId);

  return prisma.manual.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      title: parsedInput.title,
      manufacturer: parsedInput.manufacturer,
      systemCategory: parsedInput.systemCategory,
      productFamily: parsedInput.productFamily ?? null,
      model: parsedInput.model ?? null,
      documentType: parsedInput.documentType,
      revisionLabel: parsedInput.revisionLabel ?? null,
      revisionDate: parseRevisionDate(parsedInput.revisionDate),
      description: parsedInput.description ?? null,
      notes: parsedInput.notes ?? null,
      tags: parsedInput.tags,
      fileId: file.id,
      fileName: file.fileName,
      mimeType: file.mimeType,
      fileSizeBytes: null,
      pageCount: parsedInput.pageCount ?? null,
      source: parsedInput.source ?? null,
      isActive: parsedInput.isActive ?? true,
      isOfflineEligible: parsedInput.isOfflineEligible ?? false,
      searchableTextStatus: parsedInput.searchableTextStatus ?? "not_requested",
      searchableText: parsedInput.searchableText ?? null,
      supersedesManualId: parsedInput.supersedesManualId ?? null,
      createdByUserId: parsedActor.userId,
      updatedByUserId: parsedActor.userId
    }
  });
}

export async function updateManual(actor: ActorContext, manualId: string, input: UpdateManualInput) {
  const parsedActor = parseActor(actor);
  ensureAdminAccess(parsedActor);
  const parsedInput = updateManualInputSchema.parse(input);
  const existing = await prisma.manual.findFirst({
    where: {
      id: manualId,
      tenantId: parsedActor.tenantId as string
    }
  });

  if (!existing) {
    throw new Error("Manual not found.");
  }

  const nextFile = parsedInput.fileId ? await getManualFileForCreate(parsedActor, parsedInput.fileId) : null;

  return prisma.manual.update({
    where: { id: existing.id },
    data: {
      title: parsedInput.title ?? undefined,
      manufacturer: parsedInput.manufacturer ?? undefined,
      systemCategory: parsedInput.systemCategory ?? undefined,
      productFamily: parsedInput.productFamily === undefined ? undefined : parsedInput.productFamily ?? null,
      model: parsedInput.model === undefined ? undefined : parsedInput.model ?? null,
      documentType: parsedInput.documentType ?? undefined,
      revisionLabel: parsedInput.revisionLabel === undefined ? undefined : parsedInput.revisionLabel ?? null,
      revisionDate: parsedInput.revisionDate === undefined ? undefined : parseRevisionDate(parsedInput.revisionDate),
      description: parsedInput.description === undefined ? undefined : parsedInput.description ?? null,
      notes: parsedInput.notes === undefined ? undefined : parsedInput.notes ?? null,
      tags: parsedInput.tags ?? undefined,
      fileId: nextFile?.id ?? undefined,
      fileName: nextFile?.fileName ?? undefined,
      mimeType: nextFile?.mimeType ?? undefined,
      pageCount: parsedInput.pageCount === undefined ? undefined : parsedInput.pageCount ?? null,
      source: parsedInput.source === undefined ? undefined : parsedInput.source ?? null,
      isActive: parsedInput.isActive ?? undefined,
      isOfflineEligible: parsedInput.isOfflineEligible ?? undefined,
      searchableTextStatus: parsedInput.searchableTextStatus ?? undefined,
      searchableText: parsedInput.searchableText === undefined ? undefined : parsedInput.searchableText ?? null,
      supersedesManualId: parsedInput.supersedesManualId === undefined ? undefined : parsedInput.supersedesManualId ?? null,
      updatedByUserId: parsedActor.userId
    }
  });
}

export async function archiveManual(actor: ActorContext, manualId: string) {
  const parsedActor = parseActor(actor);
  ensureAdminAccess(parsedActor);

  const manual = await prisma.manual.findFirst({
    where: {
      id: manualId,
      tenantId: parsedActor.tenantId as string
    }
  });

  if (!manual) {
    throw new Error("Manual not found.");
  }

  return prisma.manual.update({
    where: { id: manual.id },
    data: {
      isActive: false,
      updatedByUserId: parsedActor.userId
    }
  });
}

async function upsertManualState(
  actor: ReturnType<typeof parseActor>,
  manualId: string,
  data: Prisma.UserManualStateUncheckedCreateInput,
  update: Prisma.UserManualStateUncheckedUpdateInput
) {
  await getManualRecord(actor, manualId);

  return prisma.userManualState.upsert({
    where: {
      userId_manualId: {
        userId: actor.userId,
        manualId
      }
    },
    create: data,
    update
  });
}

export async function favoriteManual(actor: ActorContext, manualId: string) {
  const parsedActor = parseActor(actor);
  ensureInternalAccess(parsedActor);

  return upsertManualState(
    parsedActor,
    manualId,
    {
      userId: parsedActor.userId,
      manualId,
      isFavorite: true
    },
    {
      isFavorite: true
    }
  );
}

export async function unfavoriteManual(actor: ActorContext, manualId: string) {
  const parsedActor = parseActor(actor);
  ensureInternalAccess(parsedActor);

  return upsertManualState(
    parsedActor,
    manualId,
    {
      userId: parsedActor.userId,
      manualId,
      isFavorite: false
    },
    {
      isFavorite: false
    }
  );
}

export async function trackManualView(actor: ActorContext, manualId: string) {
  const parsedActor = parseActor(actor);
  ensureInternalAccess(parsedActor);

  return upsertManualState(
    parsedActor,
    manualId,
    {
      userId: parsedActor.userId,
      manualId,
      isFavorite: false,
      lastViewedAt: new Date()
    },
    {
      lastViewedAt: new Date()
    }
  );
}

export async function setManualOfflineState(actor: ActorContext, manualId: string, saveOffline: boolean) {
  const parsedActor = parseActor(actor);
  ensureInternalAccess(parsedActor);

  const manual = await getManualRecord(parsedActor, manualId);
  if (saveOffline && !manual.isOfflineEligible) {
    throw new Error("This manual is not marked for offline save.");
  }

  return upsertManualState(
    parsedActor,
    manualId,
    {
      userId: parsedActor.userId,
      manualId,
      isFavorite: false,
      savedOfflineAt: saveOffline ? new Date() : null
    },
    {
      savedOfflineAt: saveOffline ? new Date() : null
    }
  );
}

export async function getAuthorizedManualFileDownload(actor: ActorContext, manualId: string) {
  const parsedActor = parseActor(actor);
  ensureInternalAccess(parsedActor);
  const manual = await getManualRecord(parsedActor, manualId);

  return buildFileDownloadResponse({
    storageKey: manual.file.storageKey,
    fileName: manual.fileName,
    fallbackMimeType: manual.mimeType
  });
}
