import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getEmailReminderWorkspaceData } from "@testworx/lib";

import { AppPageShell, PageHeader } from "../operations-ui";
import { sendEmailRemindersAction } from "./actions";
import { EmailRemindersWorkspace } from "./email-reminders-workspace";

export default async function EmailRemindersPage({
  searchParams
}: {
  searchParams?: Promise<{
    query?: string;
    dueMonth?: string;
    hasValidEmail?: "all" | "yes" | "no";
    inspectionType?: string;
    division?: string;
    page?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const params = searchParams ? await searchParams : {};
  const data = await getEmailReminderWorkspaceData(
    {
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    },
    {
      query: typeof params.query === "string" ? params.query : undefined,
      dueMonth: typeof params.dueMonth === "string" ? params.dueMonth : undefined,
      hasValidEmail: params.hasValidEmail === "yes" || params.hasValidEmail === "no" || params.hasValidEmail === "all"
        ? params.hasValidEmail
        : undefined,
      inspectionType: typeof params.inspectionType === "string" ? params.inspectionType : undefined,
      division: typeof params.division === "string" ? params.division : undefined,
      page: typeof params.page === "string" ? Number(params.page) : undefined
    }
  );

  return (
    <AppPageShell density="wide">
      <PageHeader
        backNavigation={{ fallbackHref: "/app/admin", label: "Back to admin" }}
        eyebrow="Customer communications"
        title="Email Reminders"
        description="Prepare and send branded customer reminder emails."
        contentWidth="full"
      />
      <EmailRemindersWorkspace data={data} sendAction={sendEmailRemindersAction} />
    </AppPageShell>
  );
}
