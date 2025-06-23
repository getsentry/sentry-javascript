import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';

sentryTest(
  'sentryOnLoad callback is called before Sentry.onLoad() and handles errors in handler',
  async ({ getLocalTestUrl, page }) => {
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    const url = await getLocalTestUrl({ testDir: __dirname });
    const req = await waitForErrorRequestOnUrl(page, url);

    const eventData = envelopeRequestParser(req);

    expect(eventData.message).toBe('Test exception');

    expect(await page.evaluate('Sentry.getClient().getOptions().tracesSampleRate')).toEqual(0.123);

    expect(errors).toEqual([
      'Error while calling `sentryOnLoad` handler:',
      expect.stringContaining('Error: sentryOnLoad error'),
    ]);
  },
);
