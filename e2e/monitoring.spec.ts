import { expect, test } from "@playwright/test";

test("drives metric alerts through acknowledge, maintenance, and resolve workflows", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/workspace?project=demo-project");
  await page.getByRole("button", { name: "Operations LIVE", exact: true }).click();
  const dashboard = page.getByTestId("noc-dashboard");
  await expect(dashboard).toBeVisible();
  await expect(dashboard.getByText("Network Operations Center")).toBeVisible();

  await dashboard.getByRole("button", { name: "Simulate metric incident" }).click();
  const alerts = dashboard.getByTestId("monitoring-alert");
  await expect(alerts.first()).toBeVisible();
  await expect(dashboard.getByText(/active$/).first()).toBeVisible();

  await alerts.first().getByRole("button", { name: "Acknowledge" }).click();
  await expect(alerts.first().getByText("acknowledged", { exact: true })).toBeVisible();

  await dashboard.getByRole("button", { name: "Maintenance OFF" }).click();
  await expect(dashboard.getByRole("button", { name: "Maintenance ON" })).toBeVisible();
  await expect(alerts.first().getByText("maintenance", { exact: true })).toBeVisible();

  await dashboard.getByRole("button", { name: "Maintenance ON" }).click();
  await dashboard.getByRole("button", { name: "Restore healthy link" }).click();
  await expect(alerts.first().getByText("resolved", { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(dashboard.getByTestId("monitoring-event-list")).toContainText("alert-resolved");
  expect(errors).toEqual([]);
});
