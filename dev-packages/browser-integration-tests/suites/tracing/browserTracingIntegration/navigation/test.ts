import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should create a navigation transaction on page navigation', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  const pageloadRequest = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const navigationRequest = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#foo`);

  expect(pageloadRequest.contexts?.trace?.op).toBe('pageload');
  expect(navigationRequest.contexts?.trace?.op).toBe('navigation');

  expect(navigationRequest.transaction_info?.source).toEqual('url');

  const pageloadTraceId = pageloadRequest.contexts?.trace?.trace_id;
  const navigationTraceId = navigationRequest.contexts?.trace?.trace_id;

  expect(pageloadTraceId).toBeDefined();
  expect(navigationTraceId).toBeDefined();
  expect(pageloadTraceId).not.toEqual(navigationTraceId);

  const pageloadSpans = pageloadRequest.spans;
  const navigationSpans = navigationRequest.spans;

  const pageloadSpanId = pageloadRequest.contexts?.trace?.span_id;
  const navigationSpanId = navigationRequest.contexts?.trace?.span_id;

  expect(pageloadSpanId).toBeDefined();
  expect(navigationSpanId).toBeDefined();

  pageloadSpans?.forEach(span =>
    expect(span).toMatchObject({
      parent_span_id: pageloadSpanId,
    }),
  );

  navigationSpans?.forEach(span =>
    expect(span).toMatchObject({
      parent_span_id: navigationSpanId,
    }),
  );

  expect(pageloadSpanId).not.toEqual(navigationSpanId);
});

sentryTest('should create a new trace for for multiple navigations', async ({ getLocalTestPath, page }) => {
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

  expect(navigation1TraceId).toBeDefined();
  expect(navigation2TraceId).toBeDefined();
  expect(navigation1TraceId).not.toEqual(navigation2TraceId);
});
