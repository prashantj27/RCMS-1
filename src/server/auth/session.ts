import { createHash } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { authSecret, SESSION_TTL_SECONDS } from "../env";

export interface SessionClaims {
  /** user id */
  sub: string;
  /** fingerprint of the password hash – changing the password invalidates old sessions */
  sv: string;
}

export const sessionVersion = (passwordHash: string) => createHash("sha256").update(passwordHash).digest("hex").slice(0, 12);

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ sv: claims.sv })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(authSecret());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, authSecret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.sv !== "string") return null;
    return { sub: payload.sub, sv: payload.sv };
  } catch {
    return null;
  }
}
