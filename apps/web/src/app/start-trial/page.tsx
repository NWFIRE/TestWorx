import type { Metadata } from "next";
import { InquiryPage } from "@/components/marketing/InquiryPage";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Start your free trial | TradeWorx" };

export default async function StartTrialPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.SUBSCRIBER_FEATURES_ENABLED === "true" && process.env.SELF_SIGNUP_ENABLED === "true") redirect("/signup");
  return <InquiryPage kind="trial" plan={(await searchParams).plan} />;
}
