import { parseQuery, route } from "@/server/http";
import { dqListQuerySchema, listDqIssues } from "@/server/services/dq";

export const dynamic = "force-dynamic";

export const GET = route({ cap: "dq:read" }, async ({ req, db, user }) => listDqIssues(db, user, parseQuery(req, dqListQuerySchema)));
