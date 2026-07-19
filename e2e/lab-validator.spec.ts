import { expect, test } from "@playwright/test";

test("validates a lab from network state and applies a hint penalty", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/workspace?project=demo-project&lab=ip-ping");
  await page.getByRole("button", { name: "Lab Validator", exact: true }).click();
  await expect(page.getByTestId("lab-validator")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Lab to validate" })).toContainText("IP Address and Ping");
  await expect(page.getByText("เฉลยเต็มสำหรับ IP Address and Ping")).toHaveCount(0);

  await page.getByRole("button", { name: "Validate Lab", exact: true }).click();
  await expect(page.getByText("2/2 RULES", { exact: true })).toBeVisible();
  await expect(page.getByText("100/100 POINTS", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Hint \(0 used\)/ }).click();
  await page.getByRole("button", { name: "Validate Lab", exact: true }).click();
  await expect(page.getByText("95/100 POINTS", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByText("2/2 RULES", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
