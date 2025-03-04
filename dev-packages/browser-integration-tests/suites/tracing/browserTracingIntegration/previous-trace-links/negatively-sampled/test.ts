import { expect } from '@playwright/test';
import { SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE, type Event } from '@sentry/core';

import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../../utils/helpers';

sentryTest('includes a span link to a previously negatively sampled span', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const navigationRequest = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#foo`);

  const navigationTraceContext = navigationRequest.contexts?.trace;

  const navigationTraceId = navigationTraceContext?.trace_id;

  expect(navigationTraceContext?.op).toBe('navigation');

  expect(navigationTraceContext?.links).toEqual([
    {
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      sampled: false,
      attributes: {
        [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'previous_trace',
      },
    },
  ]);

  expect(navigationTraceId).not.toEqual(navigationTraceContext?.links![0].trace_id);
});
