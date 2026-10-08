import { z } from "zod";
import { badRequest } from "./errors";

const idSchema = z.coerce.number().int().positive().max(2_147_483_647);

export function intParam(raw: string | undefined, name = "id"): number {
  const r = idSchema.safeParse(raw);
  if (!r.success) throw badRequest(`Invalid ${name}`);
  return r.data;
}
