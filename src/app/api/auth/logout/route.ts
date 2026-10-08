import { NextResponse } from "next/server";
import { audit } from "@/server/auth/audit";
import { getSessionUser } from "@/server/auth/current-user";
import { SESSION_COOKIE, isProd } from "@/server/env";
import { publicRoute } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = publicRoute(async ({ db, ip }) => {
  const user = await getSessionUser();
  if (user) await audit(db, { actorId: user.id, actorEmail: user.email, action: "logout", ip });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/", maxAge: 0 });
  return res;
});
