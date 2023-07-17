const useV2 = process.env.REMIX_VERSION === '2';

import { getFirstSentryEnvelopeRequest } from './utils/helpers';
import { test, expect } from '@playwright/test';
import { Event } from '@sentry/types';

test('should add `pageload` transaction on load.', async ({ page, browserName }) => {
  // This test is flaky on firefox
  if (browserName === 'firefox') {
    test.skip();
  }

  const envelope = await getFirstSentryEnvelopeRequest<Event>(page, '/');

  expect(envelope.contexts?.trace.op).toBe('pageload');
  expect(envelope.tags?.['routing.instrumentation']).toBe('remix-router');
  expect(envelope.type).toBe('transaction');

  expect(envelope.transaction).toBe(useV2 ? 'root' : 'routes/index');
});
