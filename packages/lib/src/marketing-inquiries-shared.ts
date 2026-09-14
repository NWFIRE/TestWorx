export const marketingDestinations = {
  trial: "/start-trial",
  demo: "/book-demo"
} as const;

export type MarketingInquiryKind = keyof typeof marketingDestinations;
export type MarketingInquiryResult = {
  ok: boolean;
  error?: string;
  rateLimited?: boolean;
  fieldErrors?: Record<string, string[] | undefined>;
};
