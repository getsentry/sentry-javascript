import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getCurrentSession } from '../../../utils/helpers';

sentryTest('should update session when an error is thrown.', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const pageloadSession = await getCurrentSession(page, url);

  expect(pageloadSession).toBeDefined();
  expect(pageloadSession.init).toBe(true);
  expect(pageloadSession.errors).toBe(0);
  expect(pageloadSession.status).toBe('ok');

  await page.click('#throw-error');

  const updatedSession = await getCurrentSession(page);

  expect(pageloadSession.sid).toBe(updatedSession.sid);

  expect(updatedSession).toBeDefined();
  expect(updatedSession.init).toBe(true);
  expect(updatedSession.errors).toBe(1);
  expect(updatedSession.status).toBe('ok');
});

sentryTest('should update session when an exception is captured.', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const pageloadSession = await getCurrentSession(page, url);

  expect(pageloadSession).toBeDefined();
  expect(pageloadSession.init).toBe(true);
  expect(pageloadSession.errors).toBe(0);
  expect(pageloadSession.status).toBe('ok');

  await page.click('#capture-exception');

  const updatedSession = await getCurrentSession(page);

  expect(pageloadSession.sid).toBe(updatedSession.sid);

  expect(updatedSession).toBeDefined();
  expect(updatedSession.init).toBe(true);
  expect(updatedSession.errors).toBe(1);
  expect(updatedSession.status).toBe('ok');
});
