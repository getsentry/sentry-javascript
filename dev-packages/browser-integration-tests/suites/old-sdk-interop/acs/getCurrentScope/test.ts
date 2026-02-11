import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';

sentryTest(
  "doesn't crash if older SDKs access `acs.getCurrentScope` on the global object",
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    await expect(page.locator('#currentScope')).toHaveText('scope');
  },
);
