import { route } from "@/server/http";
import { intParam } from "@/server/params";
import { getAcademy } from "@/server/services/academies";

export const dynamic = "force-dynamic";

export const GET = route({ cap: "academies:read" }, async ({ db, user, params }) => getAcademy(db, user, intParam(params.id)));
