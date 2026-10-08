import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/server/auth/authenticate";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, isProd } from "@/server/env";
import { authMode } from "@/server/env";
import { AppError } from "@/server/errors";
import { parseJson, publicRoute } from "@/server/http";
import { authSecretConfigured, notConfiguredError } from "@/server/setup";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ email: z.string().trim().min(2).max(200), password: z.string().min(1).max(128) });

export const POST = publicRoute(async ({ req, db, ip }) => {
  if (authMode() === "prototype") throw new AppError(404, "not_found", "Sign-in is disabled in prototype mode");
  const { email, password } = await parseJson(req, bodySchema);
  if (!authSecretConfigured()) throw notConfiguredError(new Error("AUTH_SECRET must be set"))!;
  let result;
  try {
    result = await authenticate(db, email, password, ip);
  } catch (e) {
    throw notConfiguredError(e) ?? e; // missing tables / AUTH_SECRET → actionable 503 instead of a generic 500
  }
  const { token, user } = result;
  const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
});
