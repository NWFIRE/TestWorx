"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

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
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4 rounded-3xl border border-white/60 bg-slate-50/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08),0_4px_16px_rgba(15,23,42,0.04)] backdrop-blur-sm">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="email">Work email</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 outline-none transition-all duration-200 ease-out focus:border-slateblue focus:bg-white focus:ring-4 focus:ring-slateblue/10" id="email" name="email" type="email" required />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="password">Password</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 outline-none transition-all duration-200 ease-out focus:border-slateblue focus:bg-white focus:ring-4 focus:ring-slateblue/10" id="password" name="password" type="password" required />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button className="w-full rounded-2xl bg-slateblue px-4 py-3 font-semibold text-white transition-[filter,transform,background-color] duration-150 ease-out hover:brightness-105 active:scale-[0.99] disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

