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
  } catch (error) {
    if (error instanceof Error && /Closed inspections are no longer available/i.test(error.message)) {
      redirect("/app/tech/inspections?job=completed");
    }
    notFound();
  }

  return (
    <ExternalDocumentSigner
      jobTimeUserId={session.user.id}
      action={signInspectionDocumentAction}
      backNavigation={{ fallbackHref: "/app/tech/inspections", label: "Back to inspections" }}
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
