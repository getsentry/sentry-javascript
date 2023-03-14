import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should create a navigation transaction on page navigation', async ({ getLocalTestPath, page }) => {
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
