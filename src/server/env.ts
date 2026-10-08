/**
 * Runtime configuration. Read lazily (never at import time) so `next build`
 * succeeds on machines without secrets configured.
 */

export const isProd = () => process.env.NODE_ENV === "production";
export const isTest = () => process.env.NODE_ENV === "test";

/** Vercel serverless request bodies are capped at 4.5 MB; stay under it. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export function appVersion(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.npm_package_version ?? "dev";
}
