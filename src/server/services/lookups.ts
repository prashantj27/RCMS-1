import { sql } from "drizzle-orm";
import type { PortalUser } from "../auth/user";
import type { Db } from "../db/client";
import { rows } from "../db/util";
import { idList } from "./filters";

export interface Lookups {
  sports: { id: number; name: string }[];
  centreTypes: { id: number; label: string; operator: string }[];
}

/** Small reference lists used by filter forms. */
export async function getLookups(db: Db, user: PortalUser): Promise<Lookups> {
  const scoped = user.scope.academyIds !== null;
  const ids = user.scope.academyIds ?? [];
  const sports = await rows<{ id: number; name: string }>(
    db,
    scoped
      ? sql`select distinct s.id, s.name from sports s join athletes a on a.sport_id = s.id join enrollments e on e.athlete_id = a.id
            where ${ids.length ? sql`e.academy_id in (${idList(ids)})` : sql`false`} order by s.name`
      : sql`select id, name from sports order by name`,
  );
  const centreTypes = await rows<{ id: number; label: string; operator: string }>(
    db,
    sql`select id, label, operator from centre_types order by operator, label`,
  );
  return { sports, centreTypes };
}
