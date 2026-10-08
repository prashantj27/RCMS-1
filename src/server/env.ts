/**
 * Runtime configuration. Read lazily (never at import time) so `next build`
 * succeeds on machines without secrets configured.
 */

export const isProd = () => process.env.NODE_ENV === "production";
export const isTest = () => process.env.NODE_ENV === "test";

export function appVersion(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.npm_package_version ?? "dev";
}
