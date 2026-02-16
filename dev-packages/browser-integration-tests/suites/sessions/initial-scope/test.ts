import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { waitForSession } from '../../../utils/helpers';

sentryTest('starts a new session on pageload.', async ({ getLocalTestUrl, page }) => {
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
    did: '1337',
    errors: 0,
    init: true,
    sid: expect.any(String),
    started: expect.any(String),
    status: 'ok',
    timestamp: expect.any(String),
  });
});

sentryTest('starts a new session with navigation.', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const initSessionPromise = waitForSession(page, s => !!s.init && s.status === 'ok');

  await page.goto(url);
  const initSession = await initSessionPromise;

  const newSessionPromise = waitForSession(page, s => !!s.init && s.status === 'ok');
  await page.locator('#navigate').click();

  const newSession = await newSessionPromise;

  expect(newSession).toBeDefined();
  expect(newSession.init).toBe(true);
  expect(newSession.errors).toBe(0);
  expect(newSession.status).toBe('ok');
  expect(newSession.sid).toBeDefined();
  expect(initSession.sid).not.toBe(newSession.sid);
  expect(newSession.did).toBe('1337');
});
