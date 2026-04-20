import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getTechnicianInspectionDocumentDetail } from "@testworx/lib/server/index";

import { signInspectionDocumentAction } from "../../../../actions";
import { ExternalDocumentSigner } from "../../../../external-document-signer";

export default async function TechnicianInspectionDocumentPage({
  params
}: {
  params: Promise<{ inspectionId: string; documentId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    notFound();
  }

  if (session.user.role !== "technician") {
    redirect("/app");
  }

  const { inspectionId, documentId } = await params;

  let detail: Awaited<ReturnType<typeof getTechnicianInspectionDocumentDetail>>;
  try {
    detail = await getTechnicianInspectionDocumentDetail(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      inspectionId,
      documentId
    );
  } catch {
    notFound();
  }

  return (
    <ExternalDocumentSigner
      action={signInspectionDocumentAction}
      backNavigation={{ fallbackHref: `/app/tech/inspections/${inspectionId}`, label: "Back to inspection" }}
      document={{
        id: detail.document.id,
        label: detail.document.label,
        fileName: detail.document.fileName,
        requiresSignature: detail.document.requiresSignature,
        status: detail.document.status,
        annotatedStorageKey: detail.document.annotatedStorageKey,
        signedStorageKey: detail.document.signedStorageKey
      }}
      dispatchNotes={detail.inspection.notes}
      inspectionId={inspectionId}
    />
  );
}
