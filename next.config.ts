import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Next.js needs inline scripts/styles for hydration; everything else is locked to same-origin.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd
    ? [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "Content-Security-Policy", value: csp },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // PGlite is only used for zero-setup local development / tests; never bundle it.
  // Never bundle local dev databases / test output into serverless functions.
  outputFileTracingExcludes: { "*": [".data/**", "test-results/**", "playwright-report/**", "coverage/**"] },
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "read-excel-file"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API responses must never be cached by shared caches (they contain athlete data).
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
