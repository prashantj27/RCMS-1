import { route } from "@/server/http";
import { getLookups } from "@/server/services/lookups";
import { STATE_OPTIONS } from "@/domain/states";

export const dynamic = "force-dynamic";

export const GET = route({}, async ({ db, user }) => ({ ...(await getLookups(db, user)), states: STATE_OPTIONS }));
