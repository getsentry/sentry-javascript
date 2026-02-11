import { expect } from '@playwright/test';
import type { SessionContext } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, waitForSession } from '../../../utils/helpers';

sentryTest('should update session when an error is thrown.', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadSession = await getFirstSentryEnvelopeRequest<SessionContext>(page, url);

  const updatedSessionPromise = waitForSession(page);
  await page.locator('#throw-error').click();
  const updatedSession = await updatedSessionPromise;

  expect(pageloadSession).toBeDefined();
  expect(pageloadSession.init).toBe(true);
  expect(pageloadSession.errors).toBe(0);
  expect(updatedSession).toBeDefined();
  expect(updatedSession.init).toBe(false);
  expect(updatedSession.errors).toBe(1);
  expect(updatedSession.status).toBe('crashed');
  expect(pageloadSession.sid).toBe(updatedSession.sid);
});

sentryTest('should update session when an exception is captured.', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadSession = await getFirstSentryEnvelopeRequest<SessionContext>(page, url);

  const updatedSessionPromise = waitForSession(page);
  await page.locator('#capture-exception').click();
  const updatedSession = await updatedSessionPromise;

  expect(pageloadSession).toBeDefined();
  expect(pageloadSession.init).toBe(true);
  expect(pageloadSession.errors).toBe(0);
  expect(updatedSession).toBeDefined();
  expect(updatedSession.init).toBe(false);
  expect(updatedSession.errors).toBe(1);
  expect(updatedSession.status).toBe('ok');
  expect(pageloadSession.sid).toBe(updatedSession.sid);
});
