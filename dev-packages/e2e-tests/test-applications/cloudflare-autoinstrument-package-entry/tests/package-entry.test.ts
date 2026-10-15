import { expect, test } from '@playwright/test';
import { SENTRY_ENVIRONMENT, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

// The worker entry is a package with no Sentry calls. Any event that arrives
// proves the plugin wrapped the module that wrangler's `main` resolved to.

test('wraps a package entry with withSentry (options from instrument.server.ts)', async ({ baseURL }) => {
  const spanPromise = waitForStreamedSpan(
    'cloudflare-autoinstrument-package-entry',
    span => getSpanOp(span) === HTTP_SERVER && span.is_segment,
  );

  const res = await fetch(baseURL!);
  expect(res.status).toBe(200);

  const span = await spanPromise;
  expect(span.attributes[SENTRY_ORIGIN]?.value).toBe('auto.http.cloudflare');
  // Only `instrument.server.ts` sets this environment.
  expect(span.attributes[SENTRY_ENVIRONMENT]?.value).toBe('qa');
});

test('captures an error thrown by a package entry', async ({ baseURL }) => {
  const errorPromise = waitForError(
    'cloudflare-autoinstrument-package-entry',
    event => event.exception?.values?.[0]?.value === 'Thrown from a package entry',
  );

  const res = await fetch(`${baseURL}/throw`);
  expect(res.status).toBe(500);

  const error = await errorPromise;
  expect(error.environment).toBe('qa');
});
