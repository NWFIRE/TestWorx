import Link from "next/link";
import { marketingDestinations } from "@testworx/lib/marketing-inquiries-shared";

import { PrimaryButton } from "./shared/PrimaryButton";
import { SecondaryButton } from "./shared/SecondaryButton";
import { SectionContainer } from "./shared/SectionContainer";

export function FinalCtaSection() {
  return (
    <section className="bg-[#09283c] py-20" id="final-cta">
      <SectionContainer>
        <div className="px-2 py-4 text-center md:px-10">
          <div className="mx-auto max-w-[760px]">
            <h2 className="text-3xl font-bold tracking-[-0.04em] text-white md:text-4xl xl:text-[48px] xl:leading-[1.08]">
              Run your fire inspection business from one unified system.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-200 md:text-lg md:leading-8">
              Modern workflows for field service, reporting, manuals, billing, and customer operations.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
              <PrimaryButton href={marketingDestinations.trial}>Start Free Trial</PrimaryButton>
              <SecondaryButton href={marketingDestinations.demo}>Book Demo</SecondaryButton>
            </div>
            <p className="mt-5 text-sm text-slate-300">
              Existing customer?{" "}
              <Link className="font-semibold text-white underline underline-offset-4" href="/login">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </SectionContainer>
    </section>
  );
}
