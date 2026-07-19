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

test("applies CLI configuration and saves startup config", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/workspace?project=demo-project");
  const pcNode = page.locator(".react-flow__node").filter({ hasText: "pc-" });
  await pcNode.dispatchEvent("click");
  await page.getByRole("tab", { name: "cli" }).click();
  const command = page.getByRole("textbox", { name: "CLI command", exact: true });
  for (const value of ["enable", "configure terminal", "hostname PC-CLI-01", "end", "write memory"]) {
    await command.fill(value);
    await command.press("Enter");
  }
  await expect(pcNode).toContainText("PC-CLI-01");
  await page.getByRole("tab", { name: "running-config" }).click();
  await expect(page.getByRole("tabpanel", { name: "running-config" })).toContainText("hostname PC-CLI-01");
  await page.getByRole("tab", { name: "startup-config" }).click();
  await expect(page.getByRole("tabpanel", { name: "startup-config" })).toContainText("hostname PC-CLI-01");
  expect(errors).toEqual([]);
});

test("enforces VLAN isolation, learns MAC addresses and validates the VLAN lab", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/workspace?project=demo-project");
  const switchNode = page.locator(".react-flow__node").filter({ hasText: "layer-2-switch-" });
  await switchNode.dispatchEvent("click");
  await page.getByRole("tab", { name: "vlan" }).click();

  await page.getByLabel("VLAN ID").fill("10");
  await page.getByLabel("VLAN name").fill("USERS");
  await page.getByRole("button", { name: "Add VLAN" }).click();
  await page.getByLabel("VLAN ID").fill("20");
  await page.getByLabel("VLAN name").fill("SERVERS");
  await page.getByRole("button", { name: "Add VLAN" }).click();

  const accessVlans = page.getByRole("combobox", { name: /access VLAN/ });
  await accessVlans.nth(1).click();
  await page.getByRole("option", { name: /VLAN 10/ }).click();
  await accessVlans.nth(2).click();
  await page.getByRole("option", { name: /VLAN 20/ }).click();

  await page.getByRole("button", { name: /Ping Tool/ }).click();
  await page.getByLabel("Ping source").click();
  await page.getByRole("option", { name: /192\.168\.1\.100/ }).click();
  await page.getByLabel("Ping destination").fill("192.168.1.10");
  await page.getByRole("button", { name: "Run Ping" }).click();
  await expect(page.getByText("VLAN_MISMATCH").first()).toBeVisible();

  await accessVlans.nth(3).click();
  await page.getByRole("option", { name: /VLAN 10/ }).click();
  await page.getByRole("button", { name: "Run Ping" }).click();
  await expect(page.getByText("Ping successful")).toBeVisible();
  await expect(page.getByText(/VLAN 10 · [0-9a-f:]+ →/).first()).toBeVisible();

  await page.getByRole("button", { name: "Lab Validator" }).click();
  await page.getByRole("button", { name: "Validate Lab" }).click();
  await expect(page.getByText("พบ VLAN 10 และ VLAN 20 ใน running config")).toBeVisible();
  await expect(page.getByText("พบ access ports ใน VLAN 10 และ VLAN 20")).toBeVisible();
  expect(errors).toEqual([]);
});

test("adds a static route and exposes it through the CLI and routing table", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/workspace?project=demo-project");
  const firewallNode = page.locator(".react-flow__node").filter({ hasText: "firewall-" });
  await firewallNode.dispatchEvent("click");
  await page.getByRole("tab", { name: "routing" }).click();
  await page.getByLabel("Route destination").fill("10.20.0.0");
  await page.getByLabel("Route prefix").fill("16");
  await page.getByLabel("Route next hop").fill("192.168.1.254");
  await page.getByRole("button", { name: "Add route" }).click();
  await expect(page.getByText("S 10.20.0.0/16 via 192.168.1.254")).toBeVisible();
  await expect(page.getByText("active", { exact: true }).last()).toBeVisible();

  await page.getByRole("tab", { name: "cli" }).click();
  const command = page.getByRole("textbox", { name: "CLI command", exact: true });
  await command.fill("show ip route");
  await command.press("Enter");
  await expect(page.getByLabel("Educational CLI output")).toContainText("10.20.0.0/16");
  expect(errors).toEqual([]);
});

test("configures NAT and ordered ACL services on a firewall", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/workspace?project=demo-project");
  const firewallNode = page.locator(".react-flow__node").filter({ hasText: "firewall-" });
  await firewallNode.dispatchEvent("click");
  await page.getByRole("tab", { name: "services" }).click();

  await page.getByLabel("NAT source", { exact: true }).fill("192.168.1.0");
  await page.getByLabel("NAT source prefix", { exact: true }).fill("24");
  await page.getByLabel("NAT translated address").fill("203.0.113.10");
  await page.getByRole("button", { name: "Add NAT rule" }).click();
  await expect(page.getByText(/pat 192\.168\.1\.0\/24/)).toBeVisible();

  await page.getByLabel("ACL name").fill("EDGE");
  await page.getByLabel("ACL sequence").fill("10");
  await page.getByRole("button", { name: "Add / replace ACL rule" }).click();
  await page.getByRole("button", { name: "Apply ACL to interface" }).click();
  await expect(page.getByText(/EDGE 10 permit icmp/)).toBeVisible();
  await expect(page.getByText(/out · EDGE/)).toBeVisible();

  await page.getByRole("tab", { name: "cli" }).click();
  const command = page.getByRole("textbox", { name: "CLI command", exact: true });
  await command.fill("show access-lists");
  await command.press("Enter");
  await expect(page.getByLabel("Educational CLI output")).toContainText("EDGE");
  expect(errors).toEqual([]);
});

test("configures a stateful firewall and associates a wireless client", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/workspace?project=demo-project");
  const firewallNode = page.locator(".react-flow__node").filter({ hasText: "firewall-" });
  await firewallNode.dispatchEvent("click");
  await page.getByRole("tab", { name: "security" }).click();
  await page.getByRole("button", { name: "Initialize trust / untrust zones" }).click();
  await page.getByLabel("Firewall policy name").fill("TRUST-OUT");
  await page.getByRole("button", { name: "Add first-match policy" }).click();
  await expect(page.getByText(/trust → untrust · allow/)).toBeVisible();
  await page.getByRole("tab", { name: "cli" }).click();
  const command = page.getByRole("textbox", { name: "CLI command", exact: true });
  await command.fill("show security-policy");
  await command.press("Enter");
  await expect(page.getByLabel("Educational CLI output")).toContainText("TRUST-OUT");

  await page.getByRole("button", { name: "Security LIVE", exact: true }).click();
  await page.getByRole("button", { name: "Associate Client" }).click();
  await expect(page.getByText("ASSOCIATED", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("opens the live operations console and monitoring inspector", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/workspace?project=demo-project");
  await page.getByRole("button", { name: "Operations LIVE", exact: true }).click();
  await expect(page.getByTestId("operations-tool")).toBeVisible();
  await expect(page.getByText("Availability", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Monitoring", exact: true })).toBeVisible();

  const firewallNode = page.locator(".react-flow__node").filter({ hasText: "firewall-" });
  await firewallNode.dispatchEvent("click");
  await page.locator("aside").getByRole("tab", { name: "monitoring", exact: true }).click();
  await expect(page.getByText("High availability", { exact: true })).toBeVisible();
  await expect(page.getByText("ICMP, SNMP, Syslog and NetFlow framework", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("opens an SMB session and degrades a RAID pool after disk failure", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/workspace?project=demo-project");
  await page.getByRole("button", { name: "Storage LIVE", exact: true }).click();
  await expect(page.getByTestId("storage-tool")).toBeVisible();
  await page.getByRole("button", { name: "Connect and transfer" }).click();
  await expect(page.getByText("CONNECTED", { exact: true })).toBeVisible();
  await expect(page.getByText("SMB read completed through reachable network path", { exact: true })).toBeVisible();

  const nasNode = page.locator(".react-flow__node").filter({ hasText: "nas-" });
  await nasNode.dispatchEvent("click");
  await page.locator("aside").getByRole("tab", { name: "storage", exact: true }).click();
  await expect(page.getByText("Disk grid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fail disk" }).first().click();
  await expect(page.locator("aside").getByText("degraded", { exact: true })).toBeVisible();
  await expect(page.locator("aside").getByRole("button", { name: "Start rebuild" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("routes a private cloud VM through NAT and opens the cloud inspector", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/workspace?project=demo-project");
  await page.getByRole("button", { name: "Cloud LIVE", exact: true }).click();
  await expect(page.getByTestId("cloud-network-tool")).toBeVisible();
  await page.getByRole("button", { name: "Simulate", exact: true }).click();
  await expect(page.getByText("CLOUD REACHABLE", { exact: true })).toBeVisible();
  await expect(page.getByText("SNAT → 198.51.100.20", { exact: true })).toBeVisible();

  const cloudNode = page.locator(".react-flow__node").filter({ hasText: "internet-cloud-" });
  await cloudNode.dispatchEvent("click");
  await page.locator("aside").getByRole("tab", { name: "cloud-network", exact: true }).click();
  await expect(page.getByTestId("cloud-configuration-panel")).toBeVisible();
  await expect(page.getByText("Nested Cloud Canvas", { exact: true })).toBeVisible();
  await expect(page.getByText("Public Subnet", { exact: true })).toBeVisible();
  await expect(page.getByText("Private Subnet", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
