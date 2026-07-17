import { expect } from '@playwright/test';
import type { SerializedSession } from '@sentry/core/src';
import { sentryTest } from '../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests, waitForSession } from '../../../utils/helpers';

sentryTest('no session envelope on navigation when tracking is disabled', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const initialSessionPromise = waitForSession(page, s => s.init && s.status === 'ok');
  await page.goto(url);
  await initialSessionPromise;

  // Collect further sessions for 3 seconds — expect none to arrive.
  const furtherSessionsPromise = getMultipleSentryEnvelopeRequests<SerializedSession>(page, 10, {
    envelopeType: 'session',
    timeout: 3000,
  });

  await page.locator('#disable').click();
  await page.locator('#navigate').click();

  const furtherSessions = await furtherSessionsPromise;
  expect(furtherSessions).toHaveLength(0);
});

sentryTest('no session envelope on user change when tracking is disabled', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const initialSessionPromise = waitForSession(page, s => !!s.init && s.status === 'ok');
  await page.goto(url);
  await initialSessionPromise;

  const furtherSessionsPromise = getMultipleSentryEnvelopeRequests<SerializedSession>(page, 10, {
    envelopeType: 'session',
    timeout: 3000,
  });

  await page.locator('#disable').click();
  await page.locator('#set-user').click();

  const furtherSessions = await furtherSessionsPromise;
  expect(furtherSessions).toHaveLength(0);
});

sentryTest('session capture resumes after re-enabling session tracking', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const initialSessionPromise = waitForSession(page, s => s.init && s.status === 'ok');
  await page.goto(url);
  const initialSession = await initialSessionPromise;

  // Disable and navigate: no new session expected
  await page.locator('#disable').click();
  await page.locator('#navigate').click();

  // Re-enable and navigate again: a new session should now be sent
  const resumedSessionPromise = waitForSession(page, s => s.init && s.status === 'ok' && s.sid !== initialSession.sid);
  await page.locator('#enable').click();
  await page.locator('#navigate').click();

  const resumedSession = await resumedSessionPromise;
  expect(resumedSession.sid).not.toBe(initialSession.sid);
});
