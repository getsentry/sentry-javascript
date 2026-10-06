import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

const usesManagedTunnelRoute =
  (process.env.E2E_TEST_TUNNEL_ROUTE_MODE ?? 'off') !== 'off' || process.env.E2E_TEST_CUSTOM_TUNNEL_ROUTE === '1';

test.skip(usesManagedTunnelRoute, 'Default e2e suites run only in the proxy variant');

test('should parametrize server and client span names for dynamic routes', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('tanstackstart-react', span => {
    return (
      span.is_segment &&
      getSpanOp(span) === 'http.server' &&
      String(span.attributes['url.path']?.value ?? '').includes('/param/')
    );
  });

  const clientSpanPromise = waitForStreamedSpan('tanstackstart-react', span => {
    return span.is_segment && getSpanOp(span) === 'pageload' && String(span.name ?? '').includes('/param/');
  });

  await page.goto('/param/42');

  const serverSpan = await serverSpanPromise;
  const clientSpan = await clientSpanPromise;

  expect(serverSpan.name).toBe('GET /param/$id');
  expect(serverSpan.attributes['sentry.segment.name.source']).toEqual({ type: 'string', value: 'route' });

  expect(clientSpan.name).toBe('/param/$id');
  expect(clientSpan.attributes['sentry.segment.name.source']).toEqual({ type: 'string', value: 'route' });
});

test('should parametrize server and client span names for nested dynamic routes', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('tanstackstart-react', span => {
    return (
      span.is_segment &&
      getSpanOp(span) === 'http.server' &&
      String(span.attributes['url.path']?.value ?? '').includes('/users/')
    );
  });

  const clientSpanPromise = waitForStreamedSpan('tanstackstart-react', span => {
    return span.is_segment && getSpanOp(span) === 'pageload' && String(span.name ?? '').includes('/users/');
  });

  await page.goto('/users/123');

  const serverSpan = await serverSpanPromise;
  const clientSpan = await clientSpanPromise;

  expect(serverSpan.name).toBe('GET /users/$userId');
  expect(serverSpan.attributes['sentry.segment.name.source']).toEqual({ type: 'string', value: 'route' });

  expect(clientSpan.name).toBe('/users/$userId');
  expect(clientSpan.attributes['sentry.segment.name.source']).toEqual({ type: 'string', value: 'route' });
});

test('should parametrize API route span names', async ({ baseURL }) => {
  const serverSpanPromise = waitForStreamedSpan('tanstackstart-react', span => {
    return (
      span.is_segment &&
      getSpanOp(span) === 'http.server' &&
      String(span.attributes['url.path']?.value ?? '').includes('/api/user/')
    );
  });

  await fetch(`${baseURL}/api/user/456`);

  const serverSpan = await serverSpanPromise;

  expect(serverSpan.name).toBe('GET /api/user/$id');
  expect(serverSpan.attributes['sentry.segment.name.source']).toEqual({ type: 'string', value: 'route' });
});
