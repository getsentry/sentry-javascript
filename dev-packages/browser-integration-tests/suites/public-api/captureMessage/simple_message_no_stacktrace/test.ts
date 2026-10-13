import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';

sentryTest('does not capture a stack trace if `attachStackTrace` is `false`', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = envelopeRequestParser(await waitForErrorRequestOnUrl(page, url));

  expect(eventData.message).toBe('foo');
  expect(eventData.level).toBe('info');
  expect(eventData.exception).toBeUndefined();
});
