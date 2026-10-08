import { route } from "@/server/http";
import { loadDemoData } from "@/server/services/demo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Prototype mode: fill an EMPTY registry with synthetic demo data (Administrator portal only). */
export const POST = route({ cap: "imports:run" }, async ({ db, user, ip }) => {
  const report = await loadDemoData(db, user, ip);
  return { athletes: report.stats.athletes, centres: report.stats.academies, enrolments: report.stats.enrollments };
});
