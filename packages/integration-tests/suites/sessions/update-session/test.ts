import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getCurrentSession } from '../../../utils/helpers';

sentryTest('should update session when an error is thrown.', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  const pageloadSession = await getCurrentSession(page, url);
  const updatedSession = (await Promise.all([page.click('#throw-error'), getCurrentSession(page)]))[1];

  expect(pageloadSession).toBeDefined();
  expect(pageloadSession.init).toBe(true);
  expect(pageloadSession.errors).toBe(0);
  expect(updatedSession).toBeDefined();
  expect(updatedSession.init).toBe(false);
  expect(updatedSession.errors).toBe(1);
  expect(updatedSession.status).toBe('ok');
  expect(pageloadSession.sid).toBe(updatedSession.sid);
});

sentryTest('should update session when an exception is captured.', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const pageloadSession = await getCurrentSession(page, url);
  const updatedSession = (await Promise.all([page.click('#capture-exception'), getCurrentSession(page)]))[1];

  expect(pageloadSession).toBeDefined();
  expect(pageloadSession.init).toBe(true);
  expect(pageloadSession.errors).toBe(0);
  expect(updatedSession).toBeDefined();
  expect(updatedSession.init).toBe(false);
  expect(updatedSession.errors).toBe(1);
  expect(updatedSession.status).toBe('ok');
  expect(pageloadSession.sid).toBe(updatedSession.sid);
});
