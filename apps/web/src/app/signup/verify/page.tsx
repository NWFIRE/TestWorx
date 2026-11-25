import { notFound } from "next/navigation";
import { subscriberFeaturesEnabled } from "@testworx/lib/src/subscriber-policy";
import { SignupForm } from "../forms";
export default async function VerifySignupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if (!subscriberFeaturesEnabled() || process.env.SELF_SIGNUP_ENABLED !== "true") notFound();
  return <main className="mx-auto my-10 max-w-lg space-y-6 rounded-2xl border bg-white p-7"><h1 className="text-2xl font-semibold">Verify your workspace</h1><SignupForm token={(await searchParams).token ?? ""} /></main>;
}
