import type { Metadata } from "next";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { ROLE_LABELS } from "@/domain/permissions";
import { fmtDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { listUsers } from "@/server/services/users";
import { CreateUserForm, ToggleActive } from "./user-admin";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requireUser("users:manage");
  const users = await listUsers(await getDb());
  return (
    <>
      <PageHeader title="Users" description="Centre users only ever see athletes enrolled in the centres assigned to them." />
      <Card title="Add a user">
        <CreateUserForm />
      </Card>
      <h2 className="mb-2 mt-8 text-sm font-semibold text-slate-800">Accounts</h2>
      <Table caption="User accounts">
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Role</Th>
            <Th>Centres</Th>
            <Th>Status</Th>
            <Th>Last sign-in (IST)</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {users.map((u) => (
            <tr key={u.id}>
              <Td className="font-medium">{u.name}</Td>
              <Td>{u.email}</Td>
              <Td>{ROLE_LABELS[u.role]}</Td>
              <Td className="tabular-nums">{u.role === "CENTRE_USER" ? u.academyCount : "all"}</Td>
              <Td>{u.isActive ? <Badge tone="ok">Active</Badge> : <Badge tone="muted">Inactive</Badge>}</Td>
              <Td>{fmtDateTime(u.lastLoginAt)}</Td>
              <Td className="text-right">
                <ToggleActive id={u.id} isActive={u.isActive} self={u.id === me.id} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
