import { expect } from '@playwright/test';
import type { SerializedSession } from '@sentry/core/src';
import { sentryTest } from '../../../utils/fixtures';
import {
  envelopeRequestParser,
  getMultipleSentryEnvelopeRequests,
  waitForErrorRequest,
  waitForSession,
} from '../../../utils/helpers';

sentryTest(
  'no initial session envelope when tracking is disabled before the deferred capture fires',
  async ({ getLocalTestUrl, page }) => {
    // Collect all session envelopes for 7 seconds then assert none arrived.
    const sessionsPromise = getMultipleSentryEnvelopeRequests<SerializedSession>(page, 10, {
      envelopeType: 'session',
      timeout: 7000,
    });

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    const sessions = await sessionsPromise;
    expect(sessions.filter(s => s.init)).toHaveLength(0);
  },
);

sentryTest('error telemetry is still captured when session tracking is disabled', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const errorPromise = waitForErrorRequest(page);
  await page.locator('#throw-error').click();
  const errorReq = await errorPromise;

  expect(envelopeRequestParser(errorReq)).toEqual(
    expect.objectContaining({
      exception: expect.objectContaining({
        values: expect.arrayContaining([expect.objectContaining({ value: 'Test error' })]),
      }),
    }),
  );
});

sentryTest(
  'session capture starts once tracking is enabled after being disabled on load',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    // Re-enable, then trigger a navigation which should now send a session.
    const sessionPromise = waitForSession(page, s => s.init && s.status === 'ok');
    await page.locator('#enable').click();
    await page.locator('#navigate').click();

    const session = await sessionPromise;
    expect(session).toEqual(
      expect.objectContaining({
        init: true,
        status: 'ok',
        errors: 0,
      }),
    );
  },
);
