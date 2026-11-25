"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signupAction, verifySignupAction } from "./actions";

export function SignupForm({ token }: { token?: string }) {
  const [state, action, pending] = useActionState(token === undefined ? signupAction : verifySignupAction, { message: "", ok: false });
  return <form action={action} className="space-y-5">
    {token === undefined ? <>{[["name","Your name","text"],["companyName","Company name","text"],["email","Work email","email"],["password","Password (at least 12 characters)","password"]].map(([name,label,type]) => <label key={name} className="block text-sm font-medium">{label}<input name={name} type={type} minLength={name === "password" ? 12 : 2} maxLength={name === "email" ? 250 : 100} required className="mt-2 w-full rounded-xl border border-slate-300 p-3" /></label>)}</> : <input type="hidden" name="token" value={token} />}
    {!state.ok ? <button disabled={pending} className="min-h-11 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{pending ? "Please wait..." : token === undefined ? "Create workspace" : "Verify email and create workspace"}</button> : null}
    {state.message ? <p role="status" className={state.ok ? "text-green-800" : "text-red-700"}>{state.message}</p> : null}
    <Link className="block text-blue-700 underline" href="/login">Sign in</Link>
  </form>;
}
