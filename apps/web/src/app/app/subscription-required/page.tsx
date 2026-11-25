import Link from "next/link";
export default function SubscriptionRequired() {
  return <section className="mx-auto max-w-2xl space-y-5 rounded-2xl border bg-white p-7"><h1 className="text-2xl font-semibold">Company subscription needs attention</h1><p>Your work is preserved. Ask your company administrator to review the subscription.</p><Link className="inline-flex min-h-11 items-center text-blue-700 underline" href="/app/help">Contact support</Link></section>;
}
