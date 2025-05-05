import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';

sentryTest('should add breadcrumb from onLoad callback to message', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const req = await waitForErrorRequestOnUrl(page, url);

  const eventData = envelopeRequestParser(req);

  expect(eventData.message).toBe('test');
  expect(eventData.breadcrumbs?.length).toBe(1);
  expect(eventData.breadcrumbs).toEqual([
    {
      category: 'auth',
      level: 'error',
      message: 'testing loader',
      timestamp: expect.any(Number),
    },
  ]);
});
