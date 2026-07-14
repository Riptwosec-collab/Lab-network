import { expect, test } from "@playwright/test";

test("loads demo, saves and exports", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "เปิด Demo Project" }).click();
  await expect(page.getByText("internet-cloud", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: /Save/ }).click();
  await expect(page.getByText("บันทึกแล้ว")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export/ }).click();
  await expect(await download).toBeTruthy();
  expect(errors).toEqual([]);
});

test("loads the built-in demo from a direct workspace URL", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/workspace?project=demo-project");
  await expect(page.getByText("internet-cloud", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("7 NODES")).toBeVisible();
  expect(errors).toEqual([]);
});

test("runs a same-subnet ping through the simulation worker", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/workspace?project=demo-project");
  await expect(page.getByText("internet-cloud", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: /Ping Tool/ }).click();
  await expect(page.getByRole("heading", { name: "Ping Tool" })).toBeVisible();
  await page.getByRole("button", { name: "Run Ping" }).click();
  await expect(page.getByText("Ping successful")).toBeVisible();
  await expect(page.getByText("ICMP Echo Reply", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("edits IPv4 configuration from the device inspector", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/workspace?project=demo-project");
  const nasNode = page.locator(".react-flow__node").filter({ hasText: "nas-" });
  await nasNode.click();
  await page.getByRole("tab", { name: "ip" }).click();
  await page.getByLabel("IPv4 Address").fill("192.168.1.11");
  await page.getByRole("button", { name: "บันทึก IPv4" }).click();
  await expect(nasNode).toContainText("192.168.1.11");
  expect(errors).toEqual([]);
});
