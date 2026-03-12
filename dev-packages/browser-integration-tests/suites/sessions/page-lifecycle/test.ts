import { expect } from '@playwright/test';
import type { SerializedSession } from '@sentry/core/src';
import { sentryTest } from '../../../utils/fixtures';
import {
  envelopeRequestParser,
  getMultipleSentryEnvelopeRequests,
  waitForErrorRequest,
  waitForSession,
} from '../../../utils/helpers';

sentryTest('starts a session on pageload with page lifecycle.', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const sessionPromise = waitForSession(page, s => !!s.init && s.status === 'ok');
  await page.goto(url);
  const session = await sessionPromise;

  expect(session).toBeDefined();
  expect(session).toEqual({
    attrs: {
      environment: 'production',
      release: '0.1',
      user_agent: expect.any(String),
    },
    errors: 0,
    init: true,
    sid: expect.any(String),
    started: expect.any(String),
    status: 'ok',
    timestamp: expect.any(String),
  });
});

sentryTest(
  "doesn't start a new session on pushState navigation with page lifecycle.",
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const sessionsPromise = getMultipleSentryEnvelopeRequests<SerializedSession>(page, 10, {
      url,
      envelopeType: 'session',
      timeout: 4000,
    });

    const manualSessionsPromise = getMultipleSentryEnvelopeRequests<SerializedSession>(page, 10, {
      envelopeType: 'session',
      timeout: 4000,
    });

    const eventsPromise = waitForErrorRequest(page, e => e.message === 'Test error from manual session');

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
    const event = envelopeRequestParser(await eventsPromise);

    expect(newSessions.length).toBe(2);
    expect(newSessions[0].init).toBe(true);
    expect(newSessions[1].init).toBe(true);
    expect(newSessions[1].sid).not.toBe(newSessions[0].sid);
    expect(event).toEqual(
      expect.objectContaining({
        level: 'error',
        message: 'Test error from manual session',
      }),
    );
  },
);

sentryTest('Updates the session when an error is thrown', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const initialSessionPromise = waitForSession(page, s => !!s.init && s.status === 'ok');
  await page.goto(url);
  const initialSession = await initialSessionPromise;

  // for good measure, throw in a few navigations
  await page.locator('#navigate').click();
  await page.locator('#navigate').click();
  await page.locator('#navigate').click();

  const updatedSessionPromise = waitForSession(page, s => !s.init && s.status !== 'ok');
  await page.locator('#error').click();
  const updatedSession = await updatedSessionPromise;

  expect(updatedSession).toEqual({
    ...initialSession,
    errors: 1,
    init: false,
    status: 'crashed',
    timestamp: expect.any(String),
  });
});
