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

sentryTest('should start a new session with navigation.', async ({ getLocalTestPath, page, browserName }) => {
  // Navigations get CORS error on Firefox and WebKit as we're using `file://` protocol.
  if (browserName !== 'chromium') {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.route('**/foo', (route: Route) => route.fulfill({ path: `${__dirname}/dist/index.html` }));

  const initSession = await getCurrentSession(page, url);

  await page.click('#navigate');

  const newSession = await getCurrentSession(page);

  expect(newSession).toBeDefined();
  expect(newSession.init).toBe(true);
  expect(newSession.errors).toBe(0);
  expect(newSession.status).toBe('ok');
  expect(newSession.sid).toBeDefined();
  expect(initSession.sid).not.toBe(newSession.sid);
});
