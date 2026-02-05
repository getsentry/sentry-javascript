import { expect } from '@playwright/test';
import type { SessionContext } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../utils/helpers';

sentryTest('should start a session on pageload with page lifecycle.', async ({ getLocalTestUrl, page }) => {
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
  'should NOT start a new session on pushState navigation with page lifecycle.',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const sessionsPromise = getMultipleSentryEnvelopeRequests<SessionContext>(page, 10, {
      url,
      envelopeType: 'session',
      timeout: 4000,
    });

    const manualSessionsPromise = getMultipleSentryEnvelopeRequests<SessionContext>(page, 10, {
      envelopeType: 'session',
      timeout: 4000,
    });

    const eventsPromise = getMultipleSentryEnvelopeRequests<SessionContext>(page, 10, {
      envelopeType: 'event',
      timeout: 4000,
    });

    await page.waitForSelector('#navigate');

    await page.locator('#navigate').click();
    await page.locator('#navigate').click();
    await page.locator('#navigate').click();

    const sessions = (await sessionsPromise).filter(session => session.init);

    expect(sessions.length).toBe(1);
    expect(sessions[0].init).toBe(true);

    // teardown and verify if nothing else got sent
    await page.locator('#manual-session').click();

    const newSessions = (await manualSessionsPromise).filter(session => session.init);
    const events = await eventsPromise;

    expect(newSessions.length).toBe(2);
    expect(newSessions[0].init).toBe(true);
    expect(newSessions[1].init).toBe(true);
    expect(newSessions[1].sid).not.toBe(newSessions[0].sid);
    expect(events).toEqual([
      expect.objectContaining({
        level: 'error',
        message: 'Test error from manual session',
      }),
    ]);
  },
);
