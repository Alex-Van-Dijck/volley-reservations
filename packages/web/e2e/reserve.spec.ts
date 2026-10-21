import { expect, test } from "@playwright/test";

const user = process.env["E2E_USER"] ?? "captain1";
const password = process.env["E2E_PASSWORD"] ?? "";

test("captain reserves a home game and cancels it", async ({ page }) => {
  test.skip(password === "", "set E2E_PASSWORD to the seeded password of the e2e user");

  await page.goto("/");
  await expect(page.getByText("Club calendar")).toBeVisible();

  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Username").fill(user);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Manage" })).toBeVisible();

  const reserve = page.getByRole("button", { name: /^Reserve \d{4}-\d{2}-\d{2}$/ }).first();
  const label = (await reserve.getAttribute("aria-label")) ?? "";
  const date = label.replace("Reserve ", "");
  await reserve.click();
  await page.getByRole("button", { name: `Save ${date}` }).click();

  const cancel = page.getByRole("button", { name: `Cancel ${date}` });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(page.getByRole("button", { name: `Reserve ${date}` })).toBeVisible();
});
