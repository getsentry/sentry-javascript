import { SENTRY_DESCRIPTION, URL_PATH } from '@sentry/conventions/attributes';
import { FUNCTION } from '@sentry/conventions/op';
import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('sends a span for each data composable as a child of the render span', async ({ request }) => {
  const transactionPromise = waitForTransaction('nuxt-4', transactionEvent => {
    return transactionEvent.contexts?.trace?.data?.[URL_PATH] === '/data-fetching';
  });

  await request.get('/data-fetching');

  const transaction = await transactionPromise;
  const renderSpan = transaction.spans?.find(span => span.origin === 'auto.function.nuxt.render');
  const dataSpans = (transaction.spans ?? []).filter(span => span.origin === 'auto.function.nuxt.data');

  expect(dataSpans.map(span => span.description).sort()).toEqual(['useAsyncData', 'useAsyncData', 'useLazyAsyncData']);
  expect(dataSpans.map(span => span.op)).toEqual([FUNCTION, FUNCTION, FUNCTION]);
  // Relay replaces the description of a transaction span with the span name, so the SDK sends no key.
  expect(dataSpans.map(span => span.data[SENTRY_DESCRIPTION])).toEqual([undefined, undefined, undefined]);
  expect(dataSpans.map(span => span.parent_span_id)).toEqual(Array(3).fill(renderSpan?.span_id));
});
