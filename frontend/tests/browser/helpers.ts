import { expect, type Page } from "@playwright/test";
export async function chooseMidpoints(page: Page) {
  await expect(page.getByRole("button", { name: "Choose midpoint · 5" }).first()).toBeVisible();
  for (const button of await page.getByRole("button", { name: "Choose midpoint · 5" }).all()) await button.click();
}

/** Enter through the same room setup a player uses, preserving a saved character. */
export async function createPlayerRoom(page: Page, name?: string) {
  if (new URL(page.url()).pathname !== "/demo") await page.goto("/demo");
  await page
    .getByRole("button", { name: "Create a room", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const field = dialog.getByLabel("Your display name");
  if (name !== undefined) await field.fill(name);
  else if (!(await field.inputValue()).trim()) await field.fill("You");
  await dialog
    .getByRole("button", { name: "Create room", exact: true })
    .click();
  await expect(page).toHaveURL(/\/play$/);
}
