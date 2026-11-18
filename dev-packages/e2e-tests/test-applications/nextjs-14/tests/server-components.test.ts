import { expect, test } from '@playwright/test';
import { waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Sends a span for a request to app router', async ({ page }) => {
  const serverComponentSpanPromise = waitForStreamedSpan('nextjs-14', span => {
    return (
      span.name === 'GET /server-component/parameter/[...parameters]' &&
      span.is_segment &&
      String(span.attributes['http.target']?.value).startsWith('/server-component/parameter/1337/42')
    );
  });

  await page.goto('/server-component/parameter/1337/42');

  const span = await serverComponentSpanPromise;

  expect(span.span_id).toEqual(expect.stringMatching(/[a-f0-9]{16}/));
  expect(span.trace_id).toEqual(expect.stringMatching(/[a-f0-9]{32}/));
  expect(span.status).toBe('ok');
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'http.server', type: 'string' },
    'sentry.origin': { value: 'auto', type: 'string' },
    'sentry.sample_rate': { value: 1, type: 'integer' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'http.method': { value: 'GET', type: 'string' },
    'http.response.status_code': { value: 200, type: 'integer' },
    'http.route': { value: '/server-component/parameter/[...parameters]', type: 'string' },
    'http.status_code': { value: 200, type: 'integer' },
    'http.target': { value: '/server-component/parameter/1337/42', type: 'string' },
    'sentry.kind': { value: 'server', type: 'string' },
    'next.route': { value: '/server-component/parameter/[...parameters]', type: 'string' },
  });
});
