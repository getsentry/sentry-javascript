import { expect } from '@playwright/test';
import { SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE, type Event } from '@sentry/core';

import { sentryTest } from '../../../../../utils/fixtures';
import {
  envelopeRequestParser,
  getFirstSentryEnvelopeRequest,
  shouldSkipTracingTest,
  waitForTransactionRequest,
} from '../../../../../utils/helpers';

sentryTest("navigation spans link back to previous trace's root span", async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadRequest = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const navigationRequest = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#foo`);
  const navigation2Request = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#bar`);

  const pageloadTraceContext = pageloadRequest.contexts?.trace;
  const navigationTraceContext = navigationRequest.contexts?.trace;
  const navigation2TraceContext = navigation2Request.contexts?.trace;

  const pageloadTraceId = pageloadTraceContext?.trace_id;
  const navigationTraceId = navigationTraceContext?.trace_id;
  const navigation2TraceId = navigation2TraceContext?.trace_id;

  expect(pageloadTraceContext?.op).toBe('pageload');
  expect(navigationTraceContext?.op).toBe('navigation');
  expect(navigation2TraceContext?.op).toBe('navigation');

  expect(pageloadTraceContext?.links).toBeUndefined();
  expect(navigationTraceContext?.links).toEqual([
    {
      trace_id: pageloadTraceId,
      span_id: pageloadTraceContext?.span_id,
      sampled: true,
      attributes: {
        [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
      },
    },
  ]);

  expect(navigation2TraceContext?.links).toEqual([
    {
      trace_id: navigationTraceId,
      span_id: navigationTraceContext?.span_id,
      sampled: true,
      attributes: {
        [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
      },
    },
  ]);

  expect(pageloadTraceId).not.toEqual(navigationTraceId);
  expect(navigationTraceId).not.toEqual(navigation2TraceId);
  expect(pageloadTraceId).not.toEqual(navigation2TraceId);
});

sentryTest("doesn't link between hard page reloads by default", async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageload1Event = await getFirstSentryEnvelopeRequest<Event>(page, url);

  const pageload2RequestPromise = waitForTransactionRequest(page, evt => evt.contexts?.trace?.op === 'pageload');
  await page.reload();
  const pageload2Event = envelopeRequestParser(await pageload2RequestPromise);

  expect(pageload1Event.contexts?.trace).toBeDefined();
  expect(pageload2Event.contexts?.trace).toBeDefined();
  expect(pageload1Event.contexts?.trace?.links).toBeUndefined();
  expect(pageload2Event.contexts?.trace?.links).toBeUndefined();
});
