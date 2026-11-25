import { notFound } from "next/navigation";
import { subscriberFeaturesEnabled } from "@testworx/lib/src/subscriber-policy";
import { SignupForm } from "./forms";
export default function SignupPage() {
  if (!subscriberFeaturesEnabled() || process.env.SELF_SIGNUP_ENABLED !== "true") notFound();
  return <main className="mx-auto my-10 max-w-lg space-y-6 rounded-2xl border bg-white p-7"><h1 className="text-2xl font-semibold">Your company. Your workspace.</h1><p className="text-slate-600">Create a private TradeWorx workspace. Team members should use their invitation instead.</p><SignupForm /></main>;
}
