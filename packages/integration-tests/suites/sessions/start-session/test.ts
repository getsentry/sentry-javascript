import { expect, Route } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getCurrentSession } from '../../../utils/helpers';

sentryTest('should start a new session on pageload.', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const session = await getCurrentSession(page, url);

  expect(session).toBeDefined();
  expect(session.init).toBe(true);
  expect(session.errors).toBe(0);
  expect(session.status).toBe('ok');
});

sentryTest('should start a new session using `startSession`.', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const pageloadSession = await getCurrentSession(page, url);

  expect(pageloadSession).toBeDefined();
  expect(pageloadSession.sid).toBeDefined();

  await page.click('#start-session');
  const newSession = await getCurrentSession(page);

  expect(newSession.init).toBe(true);
  expect(newSession.errors).toBe(0);
  expect(newSession.status).toBe('ok');
  expect(pageloadSession.sid).not.toBe(newSession.sid);
});

sentryTest(
  'should start a new session with custom context using `startSession`.',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    const pageloadSession = await getCurrentSession(page, url);

    expect(pageloadSession).toBeDefined();
    expect(pageloadSession.sid).toBeDefined();

    await page.click('#start-session-with-context');
    const newSession = await getCurrentSession(page);

    expect(newSession.init).toBe(false);
    expect(newSession.status).toBe('custom');

    // `sid` should not be accepted as a context argument.
    expect(newSession.sid).not.toBe('test_sid');
    expect(pageloadSession.sid).not.toBe(newSession.sid);
  },
);

sentryTest('should start a new session with navigation.', async ({ getLocalTestPath, page, browserName }) => {
  // This navigation logic only works on Chromium at the moment.
  // To extensively test this logic, we may need to use a web-server instead of using `file://` protocol.
  if (browserName !== 'chromium') {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.route('**/foo.html', (route: Route) => route.fulfill({ path: `${__dirname}/dist/index.html` }));

  const pageloadSession = await getCurrentSession(page, url);

  expect(pageloadSession).toBeDefined();
  expect(pageloadSession.sid).toBeDefined();

  await page.click('#navigate');
  const newSession = await getCurrentSession(page);

  expect(newSession.init).toBe(true);
  expect(newSession.errors).toBe(0);
  expect(newSession.status).toBe('ok');
  expect(newSession.sid).toBeDefined();
  expect(pageloadSession.sid).not.toBe(newSession.sid);
});
