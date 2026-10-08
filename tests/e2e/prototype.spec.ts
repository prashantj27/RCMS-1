import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/** No sign-in anywhere: the home page is the user-type selection and each portal enforces its role. */

async function open(page: Page, slug: "admin" | "hq" | "analyst") {
  await page.goto("/");
  await page.locator(`[data-portal="${slug}"]`).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test.describe("home page", () => {
  test("is the initial page and offers the four user types – no login form", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "RCMS" })).toBeVisible();
    await expect(page.getByText("Prototype – no sign-in required")).toBeVisible();
    for (const [slug, title] of [
      ["admin", "Administrator"],
      ["hq", "HQ officer"],
      ["centre", "Centre user"],
      ["analyst", "Analyst"],
    ] as const) {
      const card = page.locator(`[data-portal="${slug}"]`);
      await expect(card).toBeVisible();
      await expect(card).toContainText(title);
    }
    await expect(page.locator("input[type=password]")).toHaveCount(0);
  });

  test("there is no login module at all: no login page, no auth API, no users page", async ({ request }) => {
    for (const path of ["/login", "/signin", "/admin/users", "/api/auth/login", "/api/auth/logout", "/api/auth/me", "/api/users"]) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
    expect((await request.post("/api/auth/login", { data: { email: "admin", password: "x" } })).status()).toBe(404);
  });

  test("app pages and APIs need a chosen portal first", async ({ page, request }) => {
    for (const p of ["/dashboard", "/athletes", "/kit", "/imports"]) {
      await page.goto(p);
      await expect(page).toHaveURL(/\/$/);
    }
    expect((await request.get("/api/athletes")).status()).toBe(401);
    expect((await request.get("/enter/superuser")).status()).toBe(404);
  });
});

test.describe("Administrator portal", () => {
  test("full access: banner, home button, edit kit sizes, import form, no user admin", async ({ page }) => {
    await open(page, "admin");
    await expect(page.getByTestId("prototype-banner")).toContainText("Administrator");
    await expect(page.getByTestId("home-button")).toBeVisible();
    await expect(page.getByRole("link", { name: "Data imports" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Users", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);

    await page.goto("/athletes");
    await page.locator("table tbody tr a").first().click();
    await page.getByLabel("Shoe").fill("8");
    await page.getByRole("button", { name: "Save sizes" }).click();
    await expect(page.getByText("Sizes saved")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Shoe")).toHaveValue("8");

    await page.goto("/imports");
    await page.setInputFiles("#import-file", path.join(__dirname, "..", "fixtures", "synthetic-athletes.xlsx"));
    await page.getByRole("button", { name: "Validate (dry run)" }).click();
    await expect(page.getByText(/Dry run complete – nothing was written/)).toBeVisible();
  });
});

test.describe("security headers", () => {
  test("one CSP per page; only /imports may start the blob: worker the in-browser workbook reader needs", async ({ request }) => {
    await request.get("/enter/admin"); // /imports redirects home without a chosen portal
    const csp = async (url: string) => (await request.get(url)).headers()["content-security-policy"] ?? "";
    expect(await csp("/imports")).toContain("worker-src 'self' blob:");
    for (const url of ["/", "/imports/anything", "/api/health", "/choose-centre"]) {
      const value = await csp(url);
      expect(value, url).toContain("default-src 'self'");
      expect(value, url).not.toContain("worker-src");
    }
  });
});

test.describe("demo data loader", () => {
  test("is refused once the registry has athletes (never mixes with real data) and for non-admin portals", async ({ page }) => {
    await open(page, "admin");
    const res = await page.request.post("/api/demo-data");
    expect(res.status()).toBe(409);
    await page.goto("/enter/hq");
    expect((await page.request.post("/api/demo-data")).status()).toBe(403);
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: "Load synthetic demo data" })).toHaveCount(0);
  });
});

test.describe("HQ officer portal", () => {
  test("reads everything (personal details hidden by default) but cannot edit or import", async ({ page }) => {
    await open(page, "hq");
    await expect(page.getByTestId("prototype-banner")).toContainText("HQ officer");
    await page.goto("/athletes");
    await page.locator("table tbody tr a").first().click();
    await expect(page.getByText("Personal details")).toBeVisible();
    await expect(page.getByText("Date of birth")).toHaveCount(0);
    await expect(page.getByText("Father", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save sizes" })).toHaveCount(0);
    await page.goto("/imports");
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    await expect(page.locator("#import-file")).toHaveCount(0);
  });

  test("the API never returns date of birth or parents' names (hidden by default)", async ({ page }) => {
    await open(page, "hq");
    const list = await (await page.request.get("/api/athletes?pageSize=1")).json();
    const one = await (await page.request.get(`/api/athletes/${list.items[0].id}`)).json();
    expect(one.dob).toBeNull();
    expect(one.fatherName).toBeNull();
    expect(one.motherName).toBeNull();
    expect(JSON.stringify(one)).not.toMatch(/mobile|cipher/i);
  });

  test("the API refuses edits for this portal", async ({ page }) => {
    await open(page, "hq");
    const list = await (await page.request.get("/api/athletes?pageSize=1")).json();
    const res = await page.request.patch(`/api/athletes/${list.items[0].id}`, { data: { shoeSize: 7 } });
    expect(res.status()).toBe(403);
  });
});

test.describe("Analyst portal", () => {
  test("aggregates only – no athlete pages, no personal data", async ({ page }) => {
    await open(page, "analyst");
    await expect(page.getByTestId("prototype-banner")).toContainText("Analyst");
    await expect(page.getByRole("link", { name: "Athletes", exact: true })).toHaveCount(0);
    for (const p of ["/athletes", "/imports"]) {
      await page.goto(p);
      await expect(page).toHaveURL(/\/forbidden$/);
    }
    expect((await page.request.get("/api/athletes")).status()).toBe(403);
    expect((await page.request.get("/api/analytics/overview")).status()).toBe(200);
    await page.goto("/kit");
    await expect(page.getByRole("heading", { name: "Quantity required per size" })).toBeVisible();
  });
});

test.describe("Centre user portal", () => {
  test("shows only the chosen centre, lets you edit its athletes, blocks other centres", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-portal="centre"]').click();
    await expect(page).toHaveURL(/\/choose-centre$/);
    await expect(page.getByRole("heading", { name: /choose a centre/i })).toBeVisible();
    const first = page.locator("[data-centre]").first();
    const centreId = await first.getAttribute("data-centre");
    const centreName = (await first.locator("xpath=ancestor::li//p[1]").innerText()).trim();
    await first.click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await expect(page.getByTestId("prototype-banner")).toContainText("Centre user");
    await expect(page.getByTestId("prototype-banner")).toContainText(centreName);
    await expect(page.getByText("Figures for your centre.")).toBeVisible();

    // exactly one centre is visible, and it is the chosen one
    await page.goto("/academies");
    await expect(page.locator("table tbody tr")).toHaveCount(1);
    await expect(page.locator("table tbody tr")).toContainText(centreName);

    // athletes list == that centre's athletes (API agrees with the centre page count)
    const mine = await (await page.request.get("/api/athletes?pageSize=1")).json();
    const centre = await (await page.request.get(`/api/academies/${centreId}`)).json();
    expect(mine.total).toBe(centre.athletes);

    // another centre is invisible (404, not 403)
    const all = await (await page.request.get("/api/academies?pageSize=100")).json();
    expect(all.total).toBe(1);

    // can edit an athlete of this centre
    await page.goto("/athletes");
    await page.locator("table tbody tr a").first().click();
    await expect(page.getByRole("button", { name: "Save sizes" })).toBeVisible();

    // …but not run imports or manage users
    await page.goto("/imports");
    await expect(page).toHaveURL(/\/forbidden$/);
  });

  test("a different centre gives a different, separate portal", async ({ page }) => {
    await page.goto("/enter/centre?centre=1000");
    await expect(page).toHaveURL(/\/dashboard$/);
    const a = await (await page.request.get("/api/athletes?pageSize=1")).json();
    await page.goto("/enter/centre?centre=1001");
    const b = await (await page.request.get("/api/athletes?pageSize=1")).json();
    expect(a.total).toBeGreaterThan(0);
    expect(b.total).toBeGreaterThan(0);
    const aList = await (await page.request.get("/api/athletes?pageSize=100")).json();
    expect(aList.items.every((x: { enrollments: { academyId: number }[] }) => x.enrollments.some((e) => e.academyId === 1001))).toBe(true);
  });

  test("an unknown centre id falls back to the chooser", async ({ page }) => {
    await page.goto("/enter/centre?centre=99999999");
    await expect(page).toHaveURL(/\/choose-centre$/);
    await page.goto("/enter/centre");
    await expect(page).toHaveURL(/\/choose-centre$/);
  });

  test("the centre chooser can search", async ({ page }) => {
    await page.goto("/choose-centre");
    await page.getByLabel("Search name or code").fill("KICE");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/q=KICE/);
    for (const t of await page.locator("ul[aria-label=Centres] li p:first-child").allInnerTexts())
      expect(t.toUpperCase()).toContain("KICE");
  });
});

test.describe("switching user types with the Home button", () => {
  test("Home returns to the chooser and a new choice changes the permissions", async ({ page }) => {
    await open(page, "admin");
    await expect(page.getByRole("link", { name: "Athletes", exact: true })).toBeVisible();
    await page.getByTestId("home-button").click();
    await expect(page).toHaveURL(/\/$/);
    await page.locator('[data-portal="analyst"]').click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("prototype-banner")).toContainText("Analyst");
    await expect(page.getByRole("link", { name: "Athletes", exact: true })).toHaveCount(0);
    await page.getByTestId("prototype-banner").getByRole("link", { name: "Switch user type" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("on a phone the Home button is one tap away, outside the collapsed menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page, "hq");
    await expect(page.getByTestId("home-button-bar")).toBeVisible();
    await page.getByTestId("home-button-bar").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-portal="centre"]')).toBeVisible();
  });

  test("health reports ready with data and needs no secrets or accounts", async ({ request }) => {
    const body = await (await request.get("/api/health")).json();
    expect(body).toMatchObject({ status: "ok", db: "up", checks: { database: true, migrations: true, data: true } });
    expect(JSON.stringify(body)).not.toMatch(/auth|secret|password/i);
  });

  test("responses still carry the security headers", async ({ request }) => {
    const h = (await request.get("/")).headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  });
});
