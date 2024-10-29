import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';

sentryTest('keeps data on window.Sentry intact', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const req = await waitForErrorRequestOnUrl(page, url);

  const eventData = envelopeRequestParser(req);

  expect(eventData.message).toBe('Test exception');

  const customThingy = await page.evaluate('window.Sentry._customThingOnSentry');
  expect(customThingy).toBe('customThingOnSentry');
});
