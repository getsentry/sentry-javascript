import { expect } from '@playwright/test';
import type { SessionContext } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../utils/helpers';

sentryTest('should start a session on pageload in single mode.', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const sessions = await getMultipleSentryEnvelopeRequests<SessionContext>(page, 1, {
    url,
    envelopeType: 'session',
    timeout: 2000,
  });

  expect(sessions.length).toBeGreaterThanOrEqual(1);
  const session = sessions[0];
  expect(session).toBeDefined();
  expect(session.init).toBe(true);
  expect(session.errors).toBe(0);
  expect(session.status).toBe('ok');
});

sentryTest(
  'should NOT start a new session on pushState navigation in single mode.',
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

    expect(sessions.length).toBe(1);
    expect(sessions[0].init).toBe(true);
  },
);
