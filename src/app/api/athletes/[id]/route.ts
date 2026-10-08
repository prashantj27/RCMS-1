import { parseJson, route } from "@/server/http";
import { intParam } from "@/server/params";
import { getAthlete, kitPatchSchema, updateAthleteKit } from "@/server/services/athletes";

export const dynamic = "force-dynamic";

export const GET = route({ cap: "athletes:read" }, async ({ db, user, params }) => getAthlete(db, user, intParam(params.id)));

export const PATCH = route({ cap: "athletes:write" }, async ({ req, db, user, params, ip }) =>
  updateAthleteKit(db, user, intParam(params.id), await parseJson(req, kitPatchSchema), ip),
);
