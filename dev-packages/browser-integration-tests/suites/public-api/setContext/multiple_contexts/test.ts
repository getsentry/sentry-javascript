import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should record multiple contexts', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.message).toBe('multiple_contexts');
  expect(eventData.contexts).toMatchObject({
    context_1: {
      foo: 'bar',
      baz: { qux: 'quux' },
    },
    context_2: { 1: 'foo', bar: false },
    context_5: '[NaN]',
    context_6: 3.141592653589793,
  });
});
