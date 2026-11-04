import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';

sentryTest('opens a named modal dialog and restores focus on Escape', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname, handleLazyLoadedFeedback: true });

  await page.goto(url);

  const actor = page.getByRole('button', { name: 'Report a Bug' });
  await actor.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Report a Bug' });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => el.matches(':modal'))).toBe(true);
  await expect(page.locator('[name="message"]')).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(dialog).toBeHidden();
  await expect(actor).toBeFocused();
});
