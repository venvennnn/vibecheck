import { expect, test, type Page } from "@playwright/test";

const candidate = (id: string, name: string, entityType: string, category: string, affinity: number) => ({
  id,
  name,
  entityType,
  category,
  imageUrl: null,
  description: null,
  tags: ["city", category.toLowerCase()],
  affinity,
  queryId: "query-1",
  explainability: { entities: [{ entity_id: "seed-1", name: "Khruangbin" }] },
  explainabilityAvailable: true,
  retrievedAt: "2026-10-30T12:00:00.000Z",
  locality: entityType.endsWith("place") ? { label: "New York" } : null,
});

const discovered = [
  candidate("music-1", "Night Radio", "urn:entity:artist", "Music", 0.81),
  candidate("book-1", "Kindred Press", "urn:entity:book", "Books", 0.74),
  candidate("place-1", "Harbour Room", "urn:entity:place", "Places", 0.69),
];

function ndjson(revision: number, status: "complete" | "error" | "incomplete", error: string | null = null) {
  const base = {
    runId: "run-1",
    requestId: "req-1",
    revision,
    timestamp: "2026-10-30T12:00:00.000Z",
    toolSummary: null,
    error: null,
  };
  const lines = [
    { ...base, stageId: "music", type: "stage_started", action: "Checking music", status: "running" },
    ...(status === "error"
      ? []
      : [
          {
            ...base,
            stageId: "music",
            type: "candidates_received",
            action: "Music results",
            status: "ok",
            candidates: discovered,
          },
        ]),
    {
      ...base,
      stageId: "run",
      type: status === "error" ? "error" : "run_completed",
      action: status === "error" ? "Discovery stopped" : status === "incomplete" ? "Stopped. Partial results kept." : "Discovery finished",
      status,
      error,
    },
  ];
  return lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
}

async function fillBrief(page: Page) {
  await page.locator("html[data-session=ready]").waitFor();
  await page.locator("#brandName").fill("Harbour Club");
  await page.locator("#identity").fill("Late rooms and long tables.");
  await page.locator("#objective").fill("A two-day cultural pop-up");
  await page.locator("#city").fill("New York");
  await page.locator("#country").fill("United States");
  await page.locator("#budget").fill("15000");
  await page.locator("#startDate").fill("2026-12-05");
  await page.locator("#endDate").fill("2026-12-06");
}

async function confirmReference(page: Page, label: string) {
  await page.getByLabel("Search cultural references").fill(label);
  await page.getByRole("button", { name: "Confirm" }).first().click();
}

test.beforeEach(async ({ page }) => {
  let searches = 0;
  await page.route("**/api/resolve", async (route) => {
    searches += 1;
    const body = route.request().postDataJSON() as { query?: string; types?: string; revision?: number };
    await route.fulfill({
      json: {
        revision: body.revision ?? 0,
        requestId: "resolve",
        timestamps: { startedAt: "2026-10-30T12:00:00.000Z", finishedAt: "2026-10-30T12:00:00.000Z" },
        warnings: [],
        status: "ok",
        options: [
          {
            qlooId: `qloo-${searches}`,
            name: body.query,
            entityType: body.types ?? "urn:entity:artist",
            metadata: "recorded for the test",
          },
        ],
        ambiguous: false,
        notInQloo: false,
        requiresConfirmation: true,
      },
    });
  });
  await page.route("**/api/discover", async (route) => {
    const body = route.request().postDataJSON() as { revision: number; mode?: string };
    if (body.mode === "replace") {
      await route.fulfill({
        contentType: "application/x-ndjson",
        body: ndjson(body.revision, "complete"),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: ndjson(body.revision, "complete"),
    });
  });
});

test("graph and optimizer stay honest at desktop and phone widths", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto("/graph");
    await expect(page.getByRole("heading", { name: "No live nodes yet." })).toBeVisible();
    await expect(page.getByText("hop percentages")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.goto("/portfolio");
    await expect(page.getByRole("heading", { name: "Nothing selected yet." })).toBeVisible();
    const portfolioOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(portfolioOverflow).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/brief");
  await fillBrief(page);
  await confirmReference(page, "Khruangbin");
  await confirmReference(page, "Independent bookshops");
  await page.getByTestId("find-connections").click();
  await expect(page.getByRole("heading", { name: "Night Radio" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Cultural graph" }).click();
  await expect(page.getByRole("button", { name: /Night Radio/ })).toBeVisible();
  await page.getByRole("button", { name: /Night Radio/ }).click();
  await expect(page.getByText("Not a percentage")).toBeVisible();
  await expect(page.getByText("0.810").first()).toBeVisible();
  await expect(page.getByText("%", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Matrix" }).click();
  await expect(page.getByRole("table").getByText("Qloo affinity")).toBeVisible();
  await page.getByRole("button", { name: "Inspect raw evidence" }).click();
  await expect(page.getByText("Night Radio").first()).toBeVisible();
  await page.getByRole("button", { name: "Music (1)" }).click();
  await expect(page.getByRole("cell", { name: "Kindred Press" })).toHaveCount(0);

  await page.getByRole("link", { name: "Build portfolio" }).click();
  const optimizer = page.getByTestId("optimizer-screen");
  await expect(optimizer.getByRole("heading", { name: /Harbour Club in good company/i })).toBeVisible();
  await expect(optimizer.getByText("Allocations are not quotes.")).toBeVisible();
  const slider = optimizer.getByRole("slider", { name: "Cultural fit" });
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(optimizer.getByText("1.10")).toBeVisible();
});

test("landing, brief, and canvas stay on white at desktop and phone widths", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /unexpected/i })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe("rgb(255, 255, 255)");
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/brief");
  await expect(page.getByRole("heading", { name: /curiosity/i })).toBeVisible();
  await page.goto("/canvas");
  await expect(page.getByText("Design preview · illustrative connections")).toBeVisible();
});

test("custom brief can inspect evidence, change budget, replace a partner, and export", async ({ page }) => {
  await page.goto("/brief");
  await fillBrief(page);
  await confirmReference(page, "Khruangbin");
  await confirmReference(page, "Independent bookshops");
  await page.getByTestId("find-connections").click();
  await expect(page.getByTestId("candidate-card").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Night Radio" })).toBeVisible();
  await page.getByTestId("evidence-open").first().click();
  await expect(page.getByRole("dialog").getByText("Qloo affinity 0.810")).toBeVisible();
  await page.getByLabel("Close").click();

  await page.getByRole("button", { name: "Edit" }).click();
  const editor = page.getByRole("dialog", { name: "Edit brief" });
  await editor.getByTestId("budget-input").fill("9000");
  await editor.getByTestId("find-connections").click();
  await editor.getByRole("button", { name: "Close" }).click();

  await page.getByTestId("remove-partner").first().click();
  await expect(page.getByText(/left the mix|is out|is excluded/i)).toBeVisible();

  await page.getByRole("link", { name: "Build portfolio" }).click();
  await page.getByRole("checkbox", { name: /reviewed this proposal/i }).check();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-json").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain(".json");
});

test("provider failure and cancellation keep the screen honest", async ({ page }) => {
  await page.goto("/brief");
  await fillBrief(page);
  await confirmReference(page, "Khruangbin");
  await confirmReference(page, "Blue Bottle");
  await page.unroute("**/api/discover");
  await page.route("**/api/discover", async (route) => {
    const body = route.request().postDataJSON() as { revision: number };
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: ndjson(body.revision, "error", "Qloo rejected the API key."),
    });
  });
  await page.getByTestId("find-connections").click();
  await expect(page.getByText(/rejected the API key/i)).toBeVisible();
  await expect(page.getByText("Night Radio")).toHaveCount(0);

  await page.unroute("**/api/discover");
  await page.route("**/api/discover", async (route) => {
    const body = route.request().postDataJSON() as { revision: number };
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (route.request().signal?.aborted) return;
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: ndjson(body.revision, "incomplete"),
    });
  });
  await page.getByRole("button", { name: "Run discovery" }).click();
  await page.getByTestId("stop-run").click();
  await expect(page.getByText("Stopped. Partial results kept.")).toBeVisible();
});
