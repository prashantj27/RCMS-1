/**
 * Runtime configuration. Read lazily (never at import time) so `next build`
 * succeeds on machines without secrets configured.
 */
const DEV_SECRET = "dev-only-insecure-secret-change-me-0123456789abcdef";

export const isProd = () => process.env.NODE_ENV === "production";
export const isTest = () => process.env.NODE_ENV === "test";

export function authSecret(): Uint8Array {
  // (only reached in login mode; prototype mode never signs or verifies tokens)
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return new TextEncoder().encode(s);
  if (isProd() && !process.env.NEXT_PHASE) {
    throw new Error("AUTH_SECRET must be set to a random string of at least 32 characters in production");
  }
  return new TextEncoder().encode(DEV_SECRET);
}

/**
 * "prototype" (default): no sign-in – the home page lets you open any role's portal.
 * "login": the full email/username + password authentication (RCMS_AUTH_MODE=login).
 */
export type AuthMode = "prototype" | "login";
export const authMode = (env: Record<string, string | undefined> = process.env): AuthMode =>
  env.RCMS_AUTH_MODE?.trim().toLowerCase() === "login" ? "login" : "prototype";

export const SESSION_COOKIE = "rcms_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
/** Vercel serverless request bodies are capped at 4.5 MB; stay under it. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export function appVersion(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.npm_package_version ?? "dev";
}
