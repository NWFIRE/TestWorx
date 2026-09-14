import type { Metadata } from "next";
import { InquiryPage } from "@/components/marketing/InquiryPage";

export const metadata: Metadata = { title: "Start your free trial | TradeWorx" };

export default async function StartTrialPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <InquiryPage kind="trial" plan={(await searchParams).plan} />;
}
