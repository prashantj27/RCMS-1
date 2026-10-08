import { parseQuery, route } from "@/server/http";
import { getOverview } from "@/server/services/analytics";
import { athleteFiltersSchema } from "@/server/services/filters";

export const dynamic = "force-dynamic";

export const GET = route({ cap: "analytics:read" }, async ({ req, db, user }) =>
  getOverview(db, user, parseQuery(req, athleteFiltersSchema)),
);
