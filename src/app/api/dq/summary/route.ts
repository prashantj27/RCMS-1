import { route } from "@/server/http";
import { getDqSummary } from "@/server/services/dq";

export const dynamic = "force-dynamic";

export const GET = route({ cap: "dq:read" }, async ({ db, user }) => getDqSummary(db, user));
