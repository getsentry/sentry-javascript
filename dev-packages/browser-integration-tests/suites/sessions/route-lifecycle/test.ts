import { expect } from '@playwright/test';
import type { SerializedSession } from '@sentry/core/src';
import { sentryTest } from '../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../utils/helpers';

sentryTest(
  'should start new sessions on pushState navigation with route lifecycle (default).',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const sessionsPromise = getMultipleSentryEnvelopeRequests<SerializedSession>(page, 10, {
      url,
      envelopeType: 'session',
      timeout: 4000,
    });

    await page.waitForSelector('#navigate');

    await page.locator('#navigate').click();
    await page.locator('#navigate').click();
    await page.locator('#navigate').click();

    const startedSessions = (await sessionsPromise).filter(session => session.init);

    expect(startedSessions.length).toBe(4);
  },
);
