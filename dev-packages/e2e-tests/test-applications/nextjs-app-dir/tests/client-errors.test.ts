import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

const packageJson = require('../package.json');

test('Sends a client-side exception to Sentry', async ({ page }) => {
  const nextjsVersion = packageJson.dependencies.next;
  const nextjsMajor = Number(nextjsVersion.split('.')[0]);

  await page.goto('/');

  const errorEventPromise = waitForError('nextjs-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Click Error';
  });

  await page.getByText('Throw error').click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Click Error');

  expect(errorEvent.request).toEqual({
    headers: expect.any(Object),
    url: 'http://localhost:3030/',
  });

  expect(errorEvent.transaction).toEqual('/');

  expect(errorEvent.contexts?.trace).toEqual({
    // Next.js >= 15 propagates a trace ID to the client via a meta tag.
    parent_span_id: nextjsMajor >= 15 ? expect.any(String) : undefined,
    trace_id: expect.any(String),
    span_id: expect.any(String),
  });
});
