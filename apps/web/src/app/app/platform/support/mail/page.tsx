import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@testworx/db";
import { requireSupportOperator } from "@testworx/lib/src/subscriber-support";

export default async function StagingMail() {
  if (process.env.APP_ENV !== "staging" || process.env.EMAIL_DRIVER !== "capture") notFound();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  try { await requireSupportOperator(session.user.id); } catch { notFound(); }
  const messages = await prisma.capturedEmail.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return <section className="mx-auto max-w-5xl space-y-5"><h1 className="text-2xl font-semibold">Captured staging email</h1><p>No messages on this screen were sent externally. Account links are sensitive; access is restricted to operators.</p>
    {messages.map(message => <article key={message.id} className="space-y-3 rounded-2xl border bg-white p-5"><h2 className="font-semibold">{message.subject}</h2><p>{message.recipient}</p><p className="text-xs">Attachments: {message.attachmentNames.join(", ") || "None"}</p><details><summary className="cursor-pointer">Message source</summary><pre className="whitespace-pre-wrap break-all text-xs">{message.html}</pre></details></article>)}
  </section>;
}
