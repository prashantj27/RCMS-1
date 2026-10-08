import { cache } from "react";
import { redirect } from "next/navigation";
import type { Capability } from "@/domain/permissions";
import { forbidden, unauthorized } from "../errors";
import { getPrototypeUser } from "./prototype";
import type { PortalUser } from "./user";

/** The portal chosen on the home page for this request, or null if none has been chosen yet. */
export const getPortalUser = cache(async (): Promise<PortalUser | null> => getPrototypeUser());

/** For pages / layouts: back to the home page if no portal is chosen; /forbidden if the portal lacks the capability. */
export async function requireUser(cap?: Capability): Promise<PortalUser> {
  const user = await getPortalUser();
  if (!user) redirect("/");
  if (cap && !user.caps.has(cap)) redirect("/forbidden");
  return user;
}

/** For route handlers: throws AppError (rendered as JSON). 401 until a portal has been chosen. */
export async function requireApiUser(cap?: Capability): Promise<PortalUser> {
  const user = await getPortalUser();
  if (!user) throw unauthorized("Choose a portal on the home page first");
  if (cap && !user.caps.has(cap)) throw forbidden();
  return user;
}
