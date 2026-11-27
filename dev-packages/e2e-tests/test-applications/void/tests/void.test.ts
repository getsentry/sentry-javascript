import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp, waitForError } from '@sentry-internal/test-utils';
import { SENTRY_ENVIRONMENT, SENTRY_ORIGIN, SENTRY_SEGMENT_ID, URL_PATH } from '@sentry/conventions/attributes';
import { HTTP_SERVER, MIDDLEWARE } from '@sentry/conventions/op';
import { APP_NAME, RUNTIME } from './constants';

// Void passes each request from an outer Hono app to the app that has the routes. On Node.js, the SDK takes the
// name from the outer app: https://github.com/getsentry/sentry-javascript/issues/26948
const requestName = (route: string): string => (RUNTIME === 'cloudflare' ? `GET ${route}` : 'GET /*');

const HTTP_SERVER_ORIGIN = RUNTIME === 'cloudflare' ? 'auto.http.cloudflare' : 'auto.http.http_server';

test('sends a request span with middleware spans for a Void route', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    APP_NAME,
    segment => getSpanOp(segment) === HTTP_SERVER && segment.attributes[URL_PATH]?.value === '/api/users/42',
  );

  const response = await fetch(`${baseURL}/api/users/42`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;
  const segment = spans.find(span => span.is_segment && getSpanOp(span) === HTTP_SERVER)!;

  expect(segment.name).toBe(requestName('/api/users/:id'));
  expect(segment.attributes[SENTRY_ORIGIN]?.value).toBe(HTTP_SERVER_ORIGIN);
  // Only the options file of the runtime (`instrument.mjs` or `instrument.server.ts`) sets this environment.
  expect(segment.attributes[SENTRY_ENVIRONMENT]?.value).toBe('qa');

  expect(
    spans.filter(
      span =>
        getSpanOp(span) === MIDDLEWARE &&
        span.attributes[SENTRY_ORIGIN]?.value === 'auto.middleware.hono' &&
        span.attributes[SENTRY_SEGMENT_ID]?.value === segment.span_id,
    ),
  ).not.toHaveLength(0);
});

test('captures an error that a Void route throws', async ({ baseURL }) => {
  const errorPromise = waitForError(APP_NAME, event => event.exception?.values?.[0]?.value === 'Void route error');

  const response = await fetch(`${baseURL}/api/error`);
  expect(response.status).toBe(500);

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.http.hono.context_error',
  });
  expect(errorEvent.transaction).toBe(requestName('/api/error'));
});
