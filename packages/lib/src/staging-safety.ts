export function isLocalSandbox(env: NodeJS.ProcessEnv = process.env) {
  try {
    return !env.VERCEL && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.APP_URL ?? "").hostname);
  } catch { return false; }
}

export function permitsStagingPassword(password: string, env: NodeJS.ProcessEnv = process.env) {
  if (env.APP_ENV !== "staging") return true;
  return !["Password123!", "StagingPassword123!"].includes(password) || isLocalSandbox(env);
}
