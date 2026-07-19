import { expect, test } from "@playwright/test";

test("injects a hidden gateway fault and detects a state-based inspector fix", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/workspace?project=demo-project");
  await page.getByRole("button", { name: "Operations LIVE", exact: true }).click();
  await page.getByRole("tab", { name: "Troubleshooting", exact: true }).click();
  await page.getByRole("button", { name: "Start Scenario", exact: true }).click();
  await expect(page.getByText("Root cause is hidden while investigation is active.")).toBeVisible();
  await expect(page.getByTestId("root-cause-reveal")).toHaveCount(0);

  const pcNode = page.locator(".react-flow__node").filter({ hasText: "pc-" });
  await pcNode.dispatchEvent("click");
  await page.locator("aside").getByRole("tab", { name: "ip", exact: true }).click();
  await expect(page.getByLabel("Default Gateway")).toHaveValue("192.168.99.1");
  await page.getByLabel("Default Gateway").fill("192.168.1.1");
  await page.locator("aside").getByRole("button", { name: /IPv4/ }).click();

  await page.getByRole("combobox", { name: "Root cause candidate" }).click();
  await page.getByRole("option", { name: "Wrong Gateway", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Verify Fix & Submit", exact: true }).click();
  await expect(page.getByText(/1\/1 faults resolved · Score 100\/100/)).toBeVisible();
  await expect(page.getByTestId("root-cause-reveal")).toContainText("Wrong Gateway");
  expect(errors).toEqual([]);
});
