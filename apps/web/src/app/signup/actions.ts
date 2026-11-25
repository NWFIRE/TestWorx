"use server";
import { requestWorkspaceSignup, verifyWorkspaceSignup } from "@testworx/lib/src/workspace-signup";

export async function signupAction(_state: { message: string; ok: boolean }, form: FormData) {
  try {
    await requestWorkspaceSignup({ name: String(form.get("name") ?? ""), companyName: String(form.get("companyName") ?? ""), email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") });
    return { ok: true, message: "Check your email for a verification link. If you already have an account, sign in instead." };
  } catch { return { ok: false, message: "Unable to create a signup request. Check your details or contact support." }; }
}

export async function verifySignupAction(_state: { message: string; ok: boolean }, form: FormData) {
  try { await verifyWorkspaceSignup(String(form.get("token") ?? "")); return { ok: true, message: "Your private workspace is ready. Sign in to select your subscription." }; }
  catch { return { ok: false, message: "This link has expired or was already used. Sign in or request a new verification link." }; }
}
