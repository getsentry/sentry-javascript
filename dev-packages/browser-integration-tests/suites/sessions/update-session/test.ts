import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { waitForSession } from '../../../utils/helpers';

sentryTest('should update session when an error is thrown.', async ({ getLocalTestUrl, page }) => {
  const pageloadSessionPromise = waitForSession(page, s => !!s.init && s.status === 'ok');
  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);
  const pageloadSession = await pageloadSessionPromise;

  const updatedSessionPromise = waitForSession(page, s => !s.init);
  await page.locator('#throw-error').click();
  const updatedSession = await updatedSessionPromise;

  expect(pageloadSession).toBeDefined();
  expect(pageloadSession.init).toBe(true);
  expect(pageloadSession.errors).toBe(0);

  expect(updatedSession.init).toBe(false);
  expect(updatedSession.errors).toBe(1);
  expect(updatedSession.status).toBe('crashed');
  expect(pageloadSession.sid).toBe(updatedSession.sid);
});

sentryTest('should update session when an exception is captured.', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadSessionPromise = waitForSession(page, s => !!s.init && s.status === 'ok');
  await page.goto(url);
  const pageloadSession = await pageloadSessionPromise;

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
