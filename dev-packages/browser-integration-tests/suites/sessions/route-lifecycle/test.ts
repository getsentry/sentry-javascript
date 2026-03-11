import { expect } from '@playwright/test';
import type { SessionContext } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../utils/helpers';

sentryTest(
  'should start new sessions on pushState navigation with route lifecycle (default).',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const sessionsPromise = getMultipleSentryEnvelopeRequests<SessionContext>(page, 10, {
      url,
      envelopeType: 'session',
      timeout: 4000,
    });

    await page.waitForSelector('#navigate');

    await page.locator('#navigate').click();
    await page.locator('#navigate').click();
    await page.locator('#navigate').click();

    const sessions = (await sessionsPromise).filter(session => session.init);

    expect(sessions.length).toBe(3);
  },
);
