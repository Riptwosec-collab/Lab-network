import { expect, test } from "@playwright/test";

test("opens the vendor-neutral diagram legend", async ({ page }) => {
  await page.goto("/symbols");
  await expect(page.getByRole("heading", { name: "Diagram Symbols & Legend" })).toBeVisible();
  await expect(page.getByText("Encrypted tunnel")).toBeVisible();
  await expect(page.getByText("Data Center Zone")).toBeVisible();
});
