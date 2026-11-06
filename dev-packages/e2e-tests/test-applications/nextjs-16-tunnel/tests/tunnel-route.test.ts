import { expect, test } from '@playwright/test';
import { HTTP_REQUEST_METHOD, SERVER_ADDRESS, URL_FULL } from '@sentry/conventions/attributes';
import { getSpanOp, waitForRequest, waitForStreamedSpan, waitForStreamedSpans } from '@sentry-internal/test-utils';
import type { Event, SerializedStreamedSpan } from '@sentry/core';

function getStringAttribute(span: SerializedStreamedSpan, key: string): string | undefined {
  const attribute = span.attributes[key];
  return attribute?.type === 'string' ? attribute.value : undefined;
}

test.skip(
  process.env.NEXT_PUBLIC_E2E_TEST_TUNNEL_MODE === 'managed',
  'The managed variants have no tunnel route, see tunnel-managed.test.ts',
);

test('Tunnel route should proxy pageload span to Sentry', async ({ page }) => {
  // Wait for the pageload span to be sent through the tunnel
  const pageloadSpanPromise = waitForStreamedSpan('nextjs-16-tunnel', span => {
    return getSpanOp(span) === 'pageload' && span.name === '/' && span.is_segment;
  });

  // Navigate to the page
  await page.goto('/');

  const pageloadSpan = await pageloadSpanPromise;

  // Verify the pageload span was received successfully
  expect(pageloadSpan).toBeDefined();
  expect(pageloadSpan.name).toBe('/');
  expect(getSpanOp(pageloadSpan)).toBe('pageload');
  expect(pageloadSpan.status).toBe('ok');
});

test('Tunnel route should send multiple pageload spans consistently', async ({ page }) => {
  // This test verifies that the tunnel route remains consistent across multiple page loads
  // (important for Turbopack which could generate different tunnel routes for client/server)

  // First pageload
  const firstPageloadPromise = waitForStreamedSpan('nextjs-16-tunnel', span => {
    return getSpanOp(span) === 'pageload' && span.name === '/' && span.is_segment;
  });

  await page.goto('/');
  const firstPageload = await firstPageloadPromise;

  expect(firstPageload).toBeDefined();
  expect(firstPageload.name).toBe('/');
  expect(getSpanOp(firstPageload)).toBe('pageload');
  expect(firstPageload.status).toBe('ok');

  // Second pageload (reload)
  const secondPageloadPromise = waitForStreamedSpan('nextjs-16-tunnel', span => {
    return getSpanOp(span) === 'pageload' && span.name === '/' && span.is_segment;
  });

  await page.reload();
  const secondPageload = await secondPageloadPromise;

  expect(secondPageload).toBeDefined();
  expect(secondPageload.name).toBe('/');
  expect(getSpanOp(secondPageload)).toBe('pageload');
  expect(secondPageload.status).toBe('ok');
});

test('Tunnel requests should not create middleware or fetch spans', async ({ page }) => {
  // This test verifies that our span filtering logic works correctly
  // The proxy runs on all routes, so we'll get a middleware span for `/`
  // But we should NOT get middleware or fetch spans for the tunnel route itself

  // Accumulate every streamed span for the duration of the test. The callback never returns true,
  // so this promise is deliberately left unsettled - the assertions below read the array instead.
  const allSpans: SerializedStreamedSpan[] = [];
  void waitForStreamedSpans('nextjs-16-tunnel', spans => {
    allSpans.push(...spans);
    return false;
  });

  // Wait for pageload span
  const pageloadPromise = waitForStreamedSpan('nextjs-16-tunnel', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/');
  const pageloadSpan = await pageloadPromise;

  // Trigger errors to force tunnel POST requests
  await page
    .evaluate(() => {
      throw new Error('Test tunnel error 1');
    })
    .catch(() => {
      // Expected to throw
    });

  await page
    .evaluate(() => {
      throw new Error('Test tunnel error 2');
    })
    .catch(() => {
      // Expected to throw
    });

  // Wait for events to be sent through tunnel, and for the spans they would wrongly produce to arrive
  await page.waitForTimeout(3000);

  // We should have received the pageload span
  expect(pageloadSpan).toBeDefined();
  expect(getSpanOp(pageloadSpan)).toBe('pageload');

  const middlewareSpans = allSpans.filter(span => getSpanOp(span) === 'middleware');

  // We WILL have a middleware span for GET / (the pageload)
  // But we should NOT have middleware spans for POST requests (tunnel route)
  const postMiddlewareSpans = middlewareSpans.filter(
    span => span.name.includes('POST') || getStringAttribute(span, HTTP_REQUEST_METHOD) === 'POST',
  );

  expect(postMiddlewareSpans).toHaveLength(0);

  // We should NOT have any fetch spans to Sentry ingest. Matched on the host attribute rather than a
  // substring of the full URL, which would also match an arbitrary host with `sentry.io` elsewhere in it.
  const sentryFetchSpans = allSpans.filter(span => {
    const host = getStringAttribute(span, SERVER_ADDRESS) ?? '';
    return getSpanOp(span) === 'http.client' && (host === 'sentry.io' || host.endsWith('.sentry.io'));
  });

  expect(sentryFetchSpans).toHaveLength(0);
});

test('Tunnel requests are sent without the cookies of the browser', async ({ page, context, baseURL }) => {
  test.skip(process.env.NEXT_PUBLIC_E2E_TEST_TUNNEL_MODE === 'handler', 'The handler variants send the cookies');
  await context.addCookies([{ name: 'session', value: '8f2c1d', url: baseURL }]);
  const proxyRequestPromise = waitForRequest('nextjs-16-tunnel', ({ envelope }) =>
    envelope[1].some(
      ([itemHeader, item]) =>
        itemHeader.type === 'event' && (item as Event).exception?.values?.[0]?.value === 'Tunnel cookie test',
    ),
  );

  await page.goto('/');
  await page.waitForFunction(() => typeof (window as { __SENTRY__?: unknown }).__SENTRY__ === 'object');
  const tunnelRequestPromise = page.waitForRequest(
    request =>
      request.method() === 'POST' &&
      new URL(request.url()).origin === baseURL &&
      (request.postData() ?? '').includes('Tunnel cookie test'),
  );
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('Tunnel cookie test');
    });
  });

  const tunnelRequest = await tunnelRequestPromise;
  const proxyRequest = await proxyRequestPromise;

  expect(await page.evaluate(() => document.cookie)).toBe('session=8f2c1d');
  expect((await tunnelRequest.allHeaders()).cookie).toBeUndefined();
  expect(proxyRequest.rawProxyRequestHeaders.cookie).toBeUndefined();
});

test.describe('Tunnel route handler', () => {
  test.skip(process.env.NEXT_PUBLIC_E2E_TEST_TUNNEL_MODE !== 'handler', 'Only the handler variants use the handler');

  test('forwards events without the cookies of the browser', async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'session', value: '8f2c1d', url: baseURL }]);
    const proxyRequestPromise = waitForRequest('nextjs-16-tunnel', ({ envelope }) =>
      envelope[1].some(
        ([itemHeader, item]) =>
          itemHeader.type === 'event' &&
          (item as Event).exception?.values?.[0]?.value === 'Tunnel route handler cookie test',
      ),
    );

    await page.goto('/');
    await page.waitForFunction(() => typeof (window as { __SENTRY__?: unknown }).__SENTRY__ === 'object');
    const tunnelRequestPromise = page.waitForRequest(
      request =>
        request.method() === 'POST' &&
        new URL(request.url()).origin === baseURL &&
        (request.postData() ?? '').includes('Tunnel route handler cookie test'),
    );
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('Tunnel route handler cookie test');
      });
    });

    const tunnelRequest = await tunnelRequestPromise;
    const proxyRequest = await proxyRequestPromise;

    expect(new URL(tunnelRequest.url()).search).toBe('');
    expect((await tunnelRequest.allHeaders()).cookie).toBe('session=8f2c1d');
    expect(proxyRequest.rawProxyRequestHeaders.cookie).toBeUndefined();
    expect(proxyRequest.rawProxyRequestHeaders['content-type']).toBe('application/x-sentry-envelope');
  });

  test('does not create server spans for tunnel requests', async ({ page, baseURL }) => {
    // One listener, so it gets every span that the proxy received before the barrier span.
    const spansBeforeBarrier: SerializedStreamedSpan[] = [];
    const barrierSpanPromise = waitForStreamedSpans('nextjs-16-tunnel', spans => {
      spansBeforeBarrier.push(...spans);
      return spans.some(span => span.is_segment && span.name === 'GET /api/flush');
    });
    const pageloadTunnelResponsePromise = page.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        new URL(response.url()).origin === baseURL &&
        (response.request().postData() ?? '').includes('pageload'),
    );

    await page.goto('/');
    await pageloadTunnelResponsePromise;
    // Flush the edge client of the edge tunnel route (a 405 on the Node.js one), then the Node.js client twice:
    // the first flush sends the tunnel spans, the second one the barrier span of the first flush.
    await page.request.get('/sentry-tunnel');
    await page.request.get('/api/flush');
    await page.request.get('/api/flush');
    await barrierSpanPromise;

    const postSpans = spansBeforeBarrier.filter(
      span => span.name.startsWith('POST') || getStringAttribute(span, HTTP_REQUEST_METHOD) === 'POST',
    );
    const ingestSpans = spansBeforeBarrier.filter(
      span =>
        getSpanOp(span) === 'http.client' && !!getStringAttribute(span, URL_FULL)?.startsWith('http://localhost:3031/'),
    );
    expect(postSpans).toEqual([]);
    expect(ingestSpans).toEqual([]);
  });
});
