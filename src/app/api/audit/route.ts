import { desc } from "drizzle-orm";
import { auditLog } from "@/server/db/schema";
import { parseQuery, route } from "@/server/http";
import { pagingSchema } from "@/server/services/filters";

export const dynamic = "force-dynamic";

export const GET = route({ cap: "audit:read" }, async ({ req, db }) => {
  const { page, pageSize } = parseQuery(req, pagingSchema);
  const items = await db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.at))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { items, page, pageSize };
});
