import Link from "next/link";

import { PrimaryButton } from "./shared/PrimaryButton";
import { SecondaryButton } from "./shared/SecondaryButton";
import { SectionContainer } from "./shared/SectionContainer";

export function FinalCtaSection() {
  return (
    <section className="py-24" id="final-cta">
      <SectionContainer>
        <div className="rounded-[32px] border border-blue-100 bg-gradient-to-br from-blue-50 to-white px-6 py-12 text-center md:px-10 md:py-14 xl:px-14 xl:py-16">
          <div className="mx-auto max-w-[760px]">
            <h2 className="text-3xl font-bold tracking-[-0.04em] text-slate-950 md:text-4xl xl:text-[48px] xl:leading-[1.02]">
              Run your fire inspection business from one unified system.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-700 md:text-lg md:leading-8">
              Modern workflows for field service, reporting, manuals, billing, and customer operations.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
              <PrimaryButton href="/login">Start Free Trial</PrimaryButton>
              <SecondaryButton href="#footer-contact">Book Demo</SecondaryButton>
            </div>
            <p className="mt-5 text-sm text-slate-500">
              Existing customer?{" "}
              <Link className="font-semibold text-slate-950 underline underline-offset-4" href="/login">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </SectionContainer>
    </section>
  );
}
