import { parseQuery, route } from "@/server/http";
import { academyListQuerySchema, listAcademies } from "@/server/services/academies";

export const dynamic = "force-dynamic";

export const GET = route({ cap: "academies:read" }, async ({ req, db, user }) =>
  listAcademies(db, user, parseQuery(req, academyListQuerySchema)),
);
