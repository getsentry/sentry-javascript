import { expect } from '@playwright/test';
import type { SessionContext } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest('should update session when an error is thrown.', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  const pageloadSession = await getFirstSentryEnvelopeRequest<SessionContext>(page, url);
  const updatedSession = (
    await Promise.all([page.click('#throw-error'), getFirstSentryEnvelopeRequest<SessionContext>(page)])
  )[1];

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

  const pageloadSession = await getFirstSentryEnvelopeRequest<SessionContext>(page, url);
  const updatedSession = (
    await Promise.all([page.click('#capture-exception'), getFirstSentryEnvelopeRequest<SessionContext>(page)])
  )[1];

  expect(pageloadSession).toBeDefined();
  expect(pageloadSession.init).toBe(true);
  expect(pageloadSession.errors).toBe(0);
  expect(updatedSession).toBeDefined();
  expect(updatedSession.init).toBe(false);
  expect(updatedSession.errors).toBe(1);
  expect(updatedSession.status).toBe('ok');
  expect(pageloadSession.sid).toBe(updatedSession.sid);
});
