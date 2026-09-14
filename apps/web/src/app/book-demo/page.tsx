import type { Metadata } from "next";
import { InquiryPage } from "@/components/marketing/InquiryPage";

export const metadata: Metadata = { title: "Book a demo | TradeWorx" };

export default async function BookDemoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <InquiryPage kind="demo" plan={(await searchParams).plan} />;
}
