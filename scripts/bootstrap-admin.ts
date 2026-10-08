/**
 * Creates the first administrator (idempotent).
 *
 *   ADMIN_EMAIL=ops@example.org ADMIN_PASSWORD='…at least 12 chars…' npm run db:bootstrap-admin
 *   (add --reset-password to overwrite the password of an existing admin)
 */
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db/client";
import { users } from "../src/server/db/schema";
import { createUser, updateUser } from "../src/server/services/users";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
    process.exit(2);
  }
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, email));
  if (!existing) {
    await createUser(db, null, { email, name: process.env.ADMIN_NAME ?? "Administrator", role: "ADMIN", password, academyIds: [] }, null);
    console.log(`Created administrator ${email}`);
  } else if (process.argv.includes("--reset-password")) {
    const actor = { id: existing.id, email: existing.email } as Parameters<typeof updateUser>[1];
    await updateUser(db, actor, existing.id, { password }, null);
    console.log(`Password reset for ${email}`);
  } else {
    console.log(`${email} already exists – nothing to do (use --reset-password to change the password)`);
  }
}

main()
  .then(() => closeDb())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
