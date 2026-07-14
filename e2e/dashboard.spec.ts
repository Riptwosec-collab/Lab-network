import { expect, test } from "@playwright/test";

test("opens dashboard and creates a project", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /ออกแบบ ทดลอง/ })).toBeVisible();
  await page.getByRole("button", { name: "สร้างโปรเจกต์ใหม่" }).click();
  await expect(page).toHaveURL(/\/workspace/);
  await expect(page.getByTestId("network-canvas")).toBeVisible();
  expect(errors).toEqual([]);
});
