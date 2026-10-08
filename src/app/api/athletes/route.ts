import { parseQuery, route } from "@/server/http";
import { listAthletes } from "@/server/services/athletes";
import { athleteListQuerySchema } from "@/server/services/filters";

export const dynamic = "force-dynamic";

export const GET = route({ cap: "athletes:read" }, async ({ req, db, user }) =>
  listAthletes(db, user, parseQuery(req, athleteListQuerySchema)),
);
