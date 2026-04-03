"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [helper, setHelper] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setHelper(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false
    });

    if (!result || result.error) {
      setError("Invalid email or password.");
      return;
    }

    startTransition(() => {
      router.push("/app");
      router.refresh();
    });
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="mt-8">
      <div className="space-y-5">
        <label className="block" htmlFor="email">
          <span className="mb-2.5 block text-sm font-medium text-slate-700">
            Work email
          </span>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@company.com"
            className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50/60 px-4 text-[15px] text-slate-900 outline-none transition-all duration-200 ease-out placeholder:text-slate-400 focus:border-[#1f4678] focus:bg-white focus:ring-4 focus:ring-[#1f4678]/10"
          />
        </label>

        <label className="block" htmlFor="password">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setHelper("Ask your administrator for a password reset link.");
              }}
              className="text-sm text-slate-500 transition-colors duration-150 hover:text-slate-800"
            >
              Forgot?
            </button>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            placeholder="Enter your password"
            className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50/60 px-4 text-[15px] text-slate-900 outline-none transition-all duration-200 ease-out placeholder:text-slate-400 focus:border-[#1f4678] focus:bg-white focus:ring-4 focus:ring-[#1f4678]/10"
          />
        </label>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {!error && helper ? (
        <p className="mt-4 text-sm text-slate-500">{helper}</p>
      ) : null}

      <button
        className="mt-7 inline-flex h-14 w-full items-center justify-center rounded-2xl bg-[#1f4678] text-base font-semibold text-white shadow-[0_12px_24px_rgba(31,70,120,0.25)] transition-all duration-150 ease-out hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>

      <div className="mt-5 flex items-center gap-2 text-sm text-slate-500">
        <div className="h-2 w-2 rounded-full bg-emerald-500" />
        Secure workspace access
      </div>
    </form>
  );
}

