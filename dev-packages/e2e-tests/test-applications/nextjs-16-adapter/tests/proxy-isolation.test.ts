import { expect, test } from '@playwright/test';
import { waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

function getProxyBreadcrumbs(event: { breadcrumbs?: { message?: string }[] }): (string | undefined)[] {
  return (event.breadcrumbs ?? [])
    .map(breadcrumb => breadcrumb.message)
    .filter(message => message?.startsWith('proxy breadcrumb'));
}

test('isolates scope data of concurrent proxy requests under the `Next.request` root span', async ({ request }) => {
  const rootSpanPromise = waitForStreamedSpan('nextjs-16-adapter', span => {
    return span.is_segment && span.attributes['next.span_type']?.value === 'Next.request';
  });
  const errorAPromise = waitForError('nextjs-16-adapter', event => {
    return event.exception?.values?.[0]?.value === 'Proxy error a';
  });
  const errorBPromise = waitForError('nextjs-16-adapter', event => {
    return event.exception?.values?.[0]?.value === 'Proxy error b';
  });

  const responses = await Promise.all([
    request.get('/api/proxy-isolation?id=a'),
    request.get('/api/proxy-isolation?id=b'),
  ]);
  for (const response of responses) {
    expect(response.headers()['x-middleware-next']).toBe('1');
  }

  await rootSpanPromise;

  const [errorA, errorB] = await Promise.all([errorAPromise, errorBPromise]);
  expect(getProxyBreadcrumbs(errorA)).toEqual(['proxy breadcrumb a']);
  expect(getProxyBreadcrumbs(errorB)).toEqual(['proxy breadcrumb b']);
});
