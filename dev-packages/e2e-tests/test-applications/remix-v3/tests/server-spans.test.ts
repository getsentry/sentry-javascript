import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

const APP_NAME = 'remix-v3';

/**
 * Selecting the span by `http.route` rather than by name is what makes the name assertions below mean
 * something: a request that never resolved its route would not match, instead of matching and then
 * passing a name check against whatever it happened to be called.
 */
function waitForServerSpan(route: string): Promise<SerializedStreamedSpan> {
  return waitForStreamedSpan(
    APP_NAME,
    span =>
      getSpanOp(span) === 'http.server' && span.is_segment === true && span.attributes?.['http.route']?.value === route,
  );
}

test('names a parameterized route after its pattern', async ({ baseURL }) => {
  const spanPromise = waitForServerSpan('/users/:id');

  await fetch(`${baseURL}/users/12345`);

  const span = await spanPromise;
  expect(span.name).toBe('GET /users/:id');
  // An id in the name would make every request its own transaction.
  expect(span.name).not.toContain('12345');
  expect(span.attributes?.['sentry.segment.name.source']?.value).toBe('route');
});

test('includes the mount prefix in the name of a mounted route', async ({ baseURL }) => {
  const spanPromise = waitForServerSpan('/api/items/:itemId');

  await fetch(`${baseURL}/api/items/abc`);

  const span = await spanPromise;
  expect(span.name).toBe('GET /api/items/:itemId');
  expect(span.name).not.toContain('abc');
});

test('records the response status', async ({ baseURL }) => {
  const spanPromise = waitForServerSpan('/teapot');

  await fetch(`${baseURL}/teapot`);

  const span = await spanPromise;
  expect(span.attributes?.['http.response.status_code']?.value).toBe(418);
  // OpenTelemetry leaves a 4xx server span unset, so the error status is the SDK's own doing.
  expect(span.status).toBe('error');
});
