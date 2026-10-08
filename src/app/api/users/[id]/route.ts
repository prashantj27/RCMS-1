import { z } from "zod";
import { badRequest } from "@/server/errors";
import { parseJson, route } from "@/server/http";
import { updateUser, updateUserSchema } from "@/server/services/users";

export const dynamic = "force-dynamic";

export const PATCH = route({ cap: "users:manage" }, async ({ req, db, user, params, ip }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw badRequest("Invalid user id");
  return { user: await updateUser(db, user, id.data, await parseJson(req, updateUserSchema), ip) };
});
