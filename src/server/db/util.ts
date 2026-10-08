import type { SQL } from "drizzle-orm";
import type { Db } from "./client";

/** `db.execute` returns an array (postgres-js) or `{ rows }` (PGlite); normalise. */
export async function rows<T = Record<string, unknown>>(db: Pick<Db, "execute">, query: SQL): Promise<T[]> {
  const res = (await db.execute(query)) as unknown;
  if (Array.isArray(res)) return res as T[];
  return ((res as { rows?: T[] }).rows ?? []) as T[];
}

export async function one<T = Record<string, unknown>>(db: Pick<Db, "execute">, query: SQL): Promise<T | undefined> {
  return (await rows<T>(db, query))[0];
}

/** Aggregates arrive as strings from some drivers (bigint); coerce safely. */
export const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
