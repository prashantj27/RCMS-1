import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/server/auth/authenticate";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, isProd } from "@/server/env";
import { parseJson, publicRoute } from "@/server/http";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ email: z.string().trim().min(2).max(200), password: z.string().min(1).max(128) });

export const POST = publicRoute(async ({ req, db, ip }) => {
  const { email, password } = await parseJson(req, bodySchema);
  const { token, user } = await authenticate(db, email, password, ip);
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
