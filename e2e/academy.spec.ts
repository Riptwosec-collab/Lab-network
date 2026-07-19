import { expect, test } from "@playwright/test";

test("loads courses, resumes progress, scores a quiz and unlocks the next lesson", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/academy");
  await expect(page.getByText("7 LEVELS", { exact: true })).toBeVisible();
  await expect(page.getByText("46", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "ล็อกบทเรียน Devices" })).toBeDisabled();

  await page.getByRole("button", { name: "เริ่มบทเรียน Network Basics" }).click();
  await expect(page.getByTestId("lesson-viewer")).toBeVisible();
  await page.getByRole("button", { name: "2. ลำดับการทำงาน" }).click();
  await page.getByRole("button", { name: "Bookmark" }).click();
  await expect(page.getByRole("button", { name: "บันทึกแล้ว" })).toBeVisible();
  await page.getByRole("button", { name: "กลับ Academy" }).click();
  await expect(page.getByRole("button", { name: /เรียนต่อ: Network Basics/ })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /เรียนต่อ: Network Basics/ }).click();
  await page.getByLabel(/วางแผน ตรวจ prerequisite/).check();
  await page.getByLabel(/ผล packet flow และตารางสถานะ/).check();
  await page.getByRole("button", { name: "ตรวจคำตอบ" }).click();
  await expect(page.getByText("คะแนน 100%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "จบบทเรียน" }).click();
  await page.getByRole("button", { name: "กลับ Academy" }).click();
  await expect(page.getByRole("button", { name: "เริ่มบทเรียน Devices" })).toBeEnabled();
  expect(errors).toEqual([]);
});
