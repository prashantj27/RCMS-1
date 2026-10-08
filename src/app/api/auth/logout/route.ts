import { NextResponse } from "next/server";
import { audit } from "@/server/auth/audit";
import { getSessionUser } from "@/server/auth/current-user";
import { SESSION_COOKIE, isProd } from "@/server/env";
import { authMode } from "@/server/env";
import { AppError } from "@/server/errors";
import { publicRoute } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = publicRoute(async ({ db, ip }) => {
  if (authMode() === "prototype") throw new AppError(404, "not_found", "Sign-in is disabled in prototype mode");
  const user = await getSessionUser();
  if (user) await audit(db, { actorId: user.id, actorEmail: user.email, action: "logout", ip });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/", maxAge: 0 });
  return res;
});
