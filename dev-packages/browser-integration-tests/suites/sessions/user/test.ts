import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { waitForSession } from '../../../utils/helpers';

sentryTest('updates the session when setting the user', async ({ getLocalTestUrl, page }) => {
  const initialSessionPromise = waitForSession(page, s => !!s.init && s.status === 'ok');
  const updatedSessionPromise = waitForSession(page, s => !s.init && s.status === 'ok');

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const initialSession = await initialSessionPromise;
  const updatedSession = await updatedSessionPromise;

  expect(initialSession).toEqual({
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

  expect(updatedSession).toEqual({
    ...initialSession,
    init: false,
    timestamp: expect.any(String),
    did: '1337',
  });
});

sentryTest('includes the user id in the exited session', async ({ getLocalTestUrl, page }) => {
  const initialSessionPromise = waitForSession(page, s => !!s.init && s.status === 'ok');

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const initialSession = await initialSessionPromise;

  const exitedInitialSessionPromise = waitForSession(page, s => !s.init && s.status === 'exited');

  await page.locator('#navigate').click();

  const exitedInitialSession = await exitedInitialSessionPromise;

  expect(exitedInitialSession).toEqual({
    ...initialSession,
    timestamp: expect.any(String),
    init: false,
    status: 'exited',
    did: '1337',
  });
});

sentryTest('includes the user id in the subsequent session', async ({ getLocalTestUrl, page }) => {
  const initialSessionPromise = waitForSession(page, s => !!s.init && s.status === 'ok');

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const initialSession = await initialSessionPromise;

  expect(initialSession).toEqual({
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

  const secondSessionPromise = waitForSession(page, s => !!s.init && s.status === 'ok' && s.sid !== initialSession.sid);

  await page.locator('#navigate').click();

  const secondSession = await secondSessionPromise;

  expect(secondSession.sid).not.toBe(initialSession.sid);
  expect(secondSession.did).toBe('1337');
});
