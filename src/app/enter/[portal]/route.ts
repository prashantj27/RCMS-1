import { NextResponse, type NextRequest } from "next/server";
import { CENTRE_COOKIE, PORTAL_COOKIE, portalBySlug } from "@/domain/prototype";
import { findCentre } from "@/server/auth/prototype";
import { getDb } from "@/server/db/client";
import { authMode, isProd } from "@/server/env";

export const dynamic = "force-dynamic";

const COOKIE = { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/", maxAge: 7 * 24 * 3600 } as const;

/**
 * Prototype mode only: pick a portal. A plain link (`/enter/admin`) so it works without JavaScript.
 * /enter/centre?centre=<academy id> picks the centre portal for one centre.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ portal: string }> }) {
  if (authMode() !== "prototype") return new NextResponse("Not found", { status: 404 });
  const portal = portalBySlug((await ctx.params).portal);
  if (!portal) return new NextResponse("Not found", { status: 404 });

  const to = (pathname: string) => {
    const url = req.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    return url;
  };

  if (portal.role === "CENTRE_USER") {
    const id = Number(req.nextUrl.searchParams.get("centre"));
    const centre = await findCentre(await getDb(), id);
    if (!centre) return NextResponse.redirect(to("/choose-centre"));
    const res = NextResponse.redirect(to("/dashboard"));
    res.cookies.set(PORTAL_COOKIE, portal.role, COOKIE);
    res.cookies.set(CENTRE_COOKIE, String(centre.id), COOKIE);
    return res;
  }

  const res = NextResponse.redirect(to("/dashboard"));
  res.cookies.set(PORTAL_COOKIE, portal.role, COOKIE);
  res.cookies.delete(CENTRE_COOKIE);
  return res;
}
