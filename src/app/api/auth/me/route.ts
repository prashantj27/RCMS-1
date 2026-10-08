import { route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route({}, async ({ user }) => ({
  user: {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    capabilities: [...user.caps],
    academyIds: user.scope.academyIds,
  },
}));
