import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../utils/helpers';

sentryTest('captureException works inside of onLoad', async ({ getLocalTestUrl, page }) => {
  const req = waitForErrorRequest(page);

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const eventData = envelopeRequestParser(await req);

  expect(eventData.message).toBe('Test exception');
});
