import { NextResponse } from "next/server";
import { parseJson, route } from "@/server/http";
import { createUser, createUserSchema, listUsers } from "@/server/services/users";

export const dynamic = "force-dynamic";

export const GET = route({ cap: "users:manage" }, async ({ db }) => ({ users: await listUsers(db) }));

export const POST = route({ cap: "users:manage" }, async ({ req, db, user, ip }) => {
  const created = await createUser(db, user, await parseJson(req, createUserSchema), ip);
  return NextResponse.json({ user: created }, { status: 201 });
});
