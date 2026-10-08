import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Demo-Passw0rd-2026";

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Username or email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in and waits until the session cookie is set and the app has redirected. */
async function loginOk(page: Page, email: string, password = PASSWORD) {
  await login(page, email, password);
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test.describe("authentication", () => {
  test("anonymous visitors are sent to the login page and APIs answer 401", async ({ page, request }) => {
    await page.goto("/athletes");
    await expect(page).toHaveURL(/\/login$/);
    expect((await request.get("/api/athletes")).status()).toBe(401);
  });

  test("wrong password shows a generic error; correct password reaches the dashboard", async ({ page }) => {
    await login(page, "admin", "definitely-wrong-password");
    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await loginOk(page, "admin");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Athletes", { exact: true }).first()).toBeVisible();
  });

  test("sign out ends the session", async ({ page }) => {
    await loginOk(page, "admin");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/athletes");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("responses carry hardening headers", async ({ request }) => {
    const res = await request.get("/login");
    const h = res.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["strict-transport-security"]).toContain("max-age");
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    const body = await health.json();
    expect(body.db).toBe("up");
    expect(body.status).toBe("ok");
    expect(body.checks).toEqual({ database: true, migrations: true, authSecret: true, accounts: true });
  });

  test("cross-origin mutations are rejected", async ({ page }) => {
    await loginOk(page, "admin");
    await expect(page).toHaveURL(/\/dashboard$/);
    const res = await page.request.patch("/api/athletes/100001", { data: { shoeSize: 7 }, headers: { Origin: "https://evil.example" } });
    expect(res.status()).toBe(403);
  });
});

test.describe("admin workflows", () => {
  test.beforeEach(async ({ page }) => {
    await loginOk(page, "admin");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("search, filter and open an athlete; edit kit sizes and see them persist", async ({ page }) => {
    await page.goto("/athletes");
    await expect(page.getByRole("table", { name: "Athletes" })).toBeVisible();
    await page.getByLabel("Gender").selectOption("F");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/gender=F/);
    const first = page.locator("table tbody tr a").first();
    await first.click();
    await expect(page.getByRole("heading", { name: "Kit & shoe sizes" })).toBeVisible();

    await page.getByLabel("Shoe").fill("9");
    await page.getByLabel("T-shirt").fill("xl");
    await page.getByRole("button", { name: "Save sizes" }).click();
    await expect(page.getByText("Sizes saved")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Shoe")).toHaveValue("9");
    await expect(page.getByLabel("T-shirt")).toHaveValue("XL");

    await page.getByLabel("Shoe").fill("0");
    await page.getByRole("button", { name: "Save sizes" }).click();
    await expect(page.getByText(/Invalid shoe size/)).toBeVisible();

    await page.getByRole("button", { name: "Mark kit issued today" }).click();
    await expect(page.getByText("Marked as kit issued")).toBeVisible();
    await expect(page.getByText(/Kit issued/).first()).toBeVisible();
  });

  test("search by KIT id finds exactly that athlete", async ({ page }) => {
    await page.goto("/athletes?q=ARAA");
    const rows = page.locator("table tbody tr");
    await expect(rows.first()).toBeVisible();
    for (const text of await rows.locator("td:nth-child(2)").allTextContents()) expect(text.startsWith("AR")).toBe(true);
  });

  test("kit planner shows quantities, groups and a CSV export", async ({ page }) => {
    await page.goto("/kit?groupBy=academy");
    await expect(page.getByRole("heading", { name: "Quantity required per size" })).toBeVisible();
    await expect(page.getByRole("table", { name: /Kit demand by Centre/ })).toBeVisible();
    const href = await page.getByRole("link", { name: "Download CSV" }).getAttribute("href");
    expect(href).toContain("format=csv");
    const csv = await page.request.get(href!);
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect(await csv.text()).toContain("Group,Athletes,Kitted");
  });

  test("data quality lists rules and drills into findings", async ({ page }) => {
    await page.goto("/data-quality");
    await expect(page.getByRole("heading", { name: "Findings by rule" })).toBeVisible();
    await page
      .getByRole("row", { name: /Joined before birth/ })
      .getByRole("link", { name: "List" })
      .click();
    await expect(page.getByText("Findings: Joined before birth")).toBeVisible();
    await expect(page.getByText("Joining date is before date of birth").first()).toBeVisible();
  });

  test("academies list and detail", async ({ page }) => {
    await page.goto("/academies");
    await page.locator("table tbody tr a").first().click();
    await expect(page.getByText("Size coverage")).toBeVisible();
  });

  test("import dry run reports counts and writes nothing", async ({ page }) => {
    await page.goto("/imports");
    await page.setInputFiles("#import-file", path.join(__dirname, "..", "fixtures", "synthetic-athletes.xlsx"));
    await page.getByRole("button", { name: "Validate (dry run)" }).click();
    await expect(page.getByText(/Dry run complete – nothing was written/)).toBeVisible();
    await expect(page.getByText(/150/).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("cell", { name: "Dry run" }).first()).toBeVisible();
  });

  test("admin can create a user who can then sign in", async ({ page, browser }) => {
    await page.goto("/admin/users");
    const email = `e2e-${Date.now()}`; // plain usernames are valid logins
    await page.getByLabel("Name", { exact: true }).fill("E2E Analyst");
    await page.getByLabel("Username or email").fill(email);
    await page.getByLabel("Initial password (min 12 characters)").fill("Sturdy-Pass-Phrase-42");
    await page.getByRole("button", { name: "Create user" }).click();
    await expect(page.getByText("User created")).toBeVisible();
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await loginOk(p2, email, "Sturdy-Pass-Phrase-42");
    await expect(p2.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await ctx.close();
  });
});

test.describe("role boundaries", () => {
  test("centre user sees only their centres and is kept out of admin areas", async ({ page }) => {
    await loginOk(page, "centre");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Figures for your assigned centres.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/forbidden$/);
    await page.goto("/imports");
    await expect(page).toHaveURL(/\/forbidden$/);
    await page.goto("/academies");
    await expect(page.locator("table tbody tr")).toHaveCount(3);
  });

  test("analyst has dashboards but no athlete-level pages", async ({ page }) => {
    await loginOk(page, "analyst");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Athletes", exact: true })).toHaveCount(0);
    await page.goto("/athletes");
    await expect(page).toHaveURL(/\/forbidden$/);
  });

  test("HQ officer can read personal details but not edit", async ({ page }) => {
    await loginOk(page, "hq");
    await page.goto("/athletes");
    await page.locator("table tbody tr a").first().click();
    await expect(page.getByText("Date of birth")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save sizes" })).toHaveCount(0);
  });
});
