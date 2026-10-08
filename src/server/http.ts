import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import type { Capability } from "@/domain/permissions";
import type { SessionUser } from "./auth/authenticate";
import { requireApiUser } from "./auth/current-user";
import { getDb, type Db } from "./db/client";
import { AppError, badRequest, forbidden } from "./errors";

type RouteParams = Record<string, string>;

export interface RouteCtx {
  req: NextRequest;
  db: Db;
  user: SessionUser;
  params: RouteParams;
  ip: string | null;
}

export interface PublicRouteCtx {
  req: NextRequest;
  db: Db;
  params: RouteParams;
  ip: string | null;
}

export const clientIp = (req: NextRequest): string | null =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated mutations: the browser always sends
 * Origin (or Sec-Fetch-Site) on cross-site requests; reject anything that is not same-origin.
 */
export function assertSameOrigin(req: NextRequest): void {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin) {
    let ok = false;
    try {
      ok = new URL(origin).host === host;
    } catch {
      ok = false;
    }
    if (!ok) throw forbidden("Cross-origin request blocked");
    return;
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw forbidden("Cross-origin request blocked");
}

export function toErrorResponse(e: unknown): NextResponse {
  if (e instanceof AppError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Invalid request",
          details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 400 },
    );
  }
  console.error("[api] unhandled error", e);
  return NextResponse.json({ error: { code: "internal_error", message: "Something went wrong" } }, { status: 500 });
}

const toResponse = (out: unknown): Response => (out instanceof Response ? out : NextResponse.json(out ?? { ok: true }));

/** Authenticated, capability-checked, CSRF-protected JSON route. */
export function route(opts: { cap?: Capability }, fn: (ctx: RouteCtx) => Promise<unknown>) {
  return async (req: NextRequest, ctx: { params: Promise<RouteParams> }): Promise<Response> => {
    try {
      assertSameOrigin(req);
      const user = await requireApiUser(opts.cap);
      const db = await getDb();
      return toResponse(await fn({ req, db, user, params: await ctx.params, ip: clientIp(req) }));
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}

/** Unauthenticated route (login, health). Still CSRF-protected for mutations. */
export function publicRoute(fn: (ctx: PublicRouteCtx) => Promise<unknown>) {
  return async (req: NextRequest, ctx: { params: Promise<RouteParams> }): Promise<Response> => {
    try {
      assertSameOrigin(req);
      const db = await getDb();
      return toResponse(await fn({ req, db, params: await ctx.params, ip: clientIp(req) }));
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}

export async function parseJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  return schema.parse(body);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}
