import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should create a new trace on each navigation', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  await getFirstSentryEnvelopeRequest<Event>(page, url);
  const navigationEvent1 = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#foo`);
  const navigationEvent2 = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#bar`);

  expect(navigationEvent1.contexts?.trace?.op).toBe('navigation');
  expect(navigationEvent2.contexts?.trace?.op).toBe('navigation');

  const navigation1TraceId = navigationEvent1.contexts?.trace?.trace_id;
  const navigation2TraceId = navigationEvent2.contexts?.trace?.trace_id;

  expect(navigation1TraceId).toMatch(/^[0-9a-f]{32}$/);
  expect(navigation2TraceId).toMatch(/^[0-9a-f]{32}$/);
  expect(navigation1TraceId).not.toEqual(navigation2TraceId);
});
