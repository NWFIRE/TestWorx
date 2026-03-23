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
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5 rounded-3xl bg-white p-8 shadow-panel">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="email">Work email</label>
        <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slateblue" id="email" name="email" type="email" required />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="password">Password</label>
        <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slateblue" id="password" name="password" type="password" required />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button className="w-full rounded-2xl bg-slateblue px-4 py-3 font-semibold text-white transition hover:bg-ink disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

