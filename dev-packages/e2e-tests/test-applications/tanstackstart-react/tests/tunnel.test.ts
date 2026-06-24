import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan, waitForTransaction } from '@sentry-internal/test-utils';

const tunnelRouteMode =
  process.env.E2E_TEST_TUNNEL_ROUTE_MODE ?? (process.env.E2E_TEST_CUSTOM_TUNNEL_ROUTE === '1' ? 'custom' : 'off');
const useStreamedSpans = process.env.E2E_TEST_STREAMED_SPANS === '1';
const expectedTunnelPathMatcher =
  tunnelRouteMode === 'static'
    ? '/monitor'
    : tunnelRouteMode === 'custom'
      ? '/custom-monitor'
      : tunnelRouteMode === 'object'
        ? '/object-monitor'
        : /^\/[a-z0-9]{8}$/;

test.skip(tunnelRouteMode === 'off', 'Tunnel assertions only run in the tunnel-route variants');

test('Sends client-side errors through the configured tunnel route', async ({ page }) => {
  const errorEventPromise = waitForError('tanstackstart-react', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Sentry Client Test Error';
  });

  await page.goto('/');
  const pageOrigin = new URL(page.url()).origin;

  // Wait for React to hydrate (see __root.tsx) before clicking — the SSR HTML
  // renders the button before the onClick handler is attached, and clicking
  // pre-hydration would fire no handler and produce no error.
  await page.locator('html[data-hydrated="true"]').waitFor();

  await expect(page.locator('button').filter({ hasText: 'Break the client' })).toBeVisible();

  const managedTunnelResponsePromise = page.waitForResponse(response => {
    const responseUrl = new URL(response.url());

    return (
      responseUrl.origin === pageOrigin &&
      response.request().method() === 'POST' &&
      (typeof expectedTunnelPathMatcher === 'string'
        ? responseUrl.pathname === expectedTunnelPathMatcher
        : expectedTunnelPathMatcher.test(responseUrl.pathname))
    );
  });

  await page.locator('button').filter({ hasText: 'Break the client' }).click();

  const managedTunnelResponse = await managedTunnelResponsePromise;
  const managedTunnelUrl = new URL(managedTunnelResponse.url());
  const errorEvent = await errorEventPromise;

  expect(managedTunnelResponse.status()).toBe(200);
  expect(managedTunnelUrl.origin).toBe(pageOrigin);

  if (typeof expectedTunnelPathMatcher === 'string') {
    expect(managedTunnelUrl.pathname).toBe(expectedTunnelPathMatcher);
  } else {
    expect(managedTunnelUrl.pathname).toMatch(expectedTunnelPathMatcher);
    expect(managedTunnelUrl.pathname).not.toBe('/monitor');
  }

  expect(errorEvent.exception?.values?.[0]?.value).toBe('Sentry Client Test Error');
  expect(errorEvent.transaction).toBe('/');
});

function pathnameMatchesTunnelRoute(pathname: string): boolean {
  return typeof expectedTunnelPathMatcher === 'string'
    ? pathname === expectedTunnelPathMatcher
    : expectedTunnelPathMatcher.test(pathname);
}

// A server `http.server` transaction can arrive either as a classic transaction event (static trace
// lifecycle) or as a Span v2 segment span (`traceLifecycle: 'stream'`). These helpers wait on whichever
// format the current run produces, so the assertion below covers both lifecycles with one test body.
function waitForServerHttpEvent(matchesPathname: (pathname: string) => boolean): Promise<unknown> {
  if (useStreamedSpans) {
    return waitForStreamedSpan('tanstackstart-react', span => {
      return getSpanOp(span) === 'http.server' && matchesPathname((span.name ?? '').split(' ')[1] ?? '');
    });
  }

  return waitForTransaction('tanstackstart-react', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      matchesPathname((transactionEvent.transaction ?? '').split(' ')[1] ?? '')
    );
  });
}

test('Does not create a server transaction for the tunnel route', async ({ page }) => {
  // The incoming POST to the tunnel route must not be turned into an `http.server`
  // transaction by the server SDK — tunnel traffic is plumbing, not application requests.
  const tunnelServerEventPromise = waitForServerHttpEvent(pathnameMatchesTunnelRoute);

  await page.goto('/');
  const pageOrigin = new URL(page.url()).origin;

  await page.locator('html[data-hydrated="true"]').waitFor();
  await expect(page.locator('button').filter({ hasText: 'Break the client' })).toBeVisible();

  const managedTunnelResponsePromise = page.waitForResponse(response => {
    const responseUrl = new URL(response.url());

    return (
      responseUrl.origin === pageOrigin &&
      response.request().method() === 'POST' &&
      pathnameMatchesTunnelRoute(responseUrl.pathname)
    );
  });

  await page.locator('button').filter({ hasText: 'Break the client' }).click();

  // Ensure the tunnel POST was fully handled server-side before we issue the anchor request below.
  await managedTunnelResponsePromise;

  // Anchor on a regular server transaction issued *after* the tunnel POST. The Node transport flushes
  // transactions/spans in FIFO order, so a (buggy) tunnel-route transaction would always arrive before
  // this anchor. Racing the two lets us assert the absence of a tunnel transaction without idling on a timeout.
  const anchorServerEventPromise = waitForServerHttpEvent(pathname => pathname.includes('/api/user/'));

  await page.request.get('/api/user/456');

  const winner = await Promise.race([
    tunnelServerEventPromise.then(() => 'tunnel' as const),
    anchorServerEventPromise.then(() => 'anchor' as const),
  ]);

  expect(winner).toBe('anchor');
});
