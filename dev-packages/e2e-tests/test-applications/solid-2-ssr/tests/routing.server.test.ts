import { expect, test } from '@playwright/test';
import { HTTP_ROUTE, SENTRY_SEGMENT_NAME_SOURCE, URL_PATH_PARAMETER_KEY_BASE } from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('names the http.server span after the matched route', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('solid-2-ssr', span => {
    return getSpanOp(span) === HTTP_SERVER && span.is_segment && span.name === 'GET /user/:id';
  });

  await page.goto('/user/5');

  const serverSpan = await serverSpanPromise;

  expect(serverSpan.attributes).toMatchObject({
    [HTTP_ROUTE]: { value: '/user/:id', type: 'string' },
    [SENTRY_SEGMENT_NAME_SOURCE]: { value: 'route', type: 'string' },
    [`${URL_PATH_PARAMETER_KEY_BASE}.id`]: { value: '5', type: 'string' },
  });
});
