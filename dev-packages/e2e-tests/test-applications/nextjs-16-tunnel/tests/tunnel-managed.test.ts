import { expect, test } from '@playwright/test';
import { HTTP_REQUEST_METHOD, URL_FULL } from '@sentry/conventions/attributes';
import { getSpanOp, waitForRequest, waitForStreamedSpan, waitForStreamedSpans } from '@sentry-internal/test-utils';
import type { Event, SerializedStreamedSpan } from '@sentry/core';

test.skip(process.env.NEXT_PUBLIC_E2E_TEST_TUNNEL_MODE !== 'managed', 'Only the managed variants use it');

const BASE_PATH = '/docs';

function getStringAttribute(span: SerializedStreamedSpan, key: string): string | undefined {
  const attribute = span.attributes[key];
  return attribute?.type === 'string' ? attribute.value : undefined;
}

function isTunnelPath(pathname: string): boolean {
  return /^\/docs\/[a-z0-9]+$/.test(pathname);
}

test('sends the pageload span through the managed tunnel under the base path', async ({ page, baseURL }) => {
  const pageloadSpanPromise = waitForStreamedSpan('nextjs-16-tunnel', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });
  const tunnelResponsePromise = page.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      new URL(response.url()).origin === baseURL &&
      (response.request().postData() ?? '').includes('pageload'),
  );

  await page.goto(BASE_PATH);

  const tunnelResponse = await tunnelResponsePromise;
  const pageloadSpan = await pageloadSpanPromise;

  expect(isTunnelPath(new URL(tunnelResponse.url()).pathname)).toBe(true);
  expect(tunnelResponse.status()).toBe(200);
  expect(pageloadSpan.status).toBe('ok');
});

test('forwards events without the cookies of the browser', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'session', value: '8f2c1d', url: baseURL }]);
  const proxyRequestPromise = waitForRequest('nextjs-16-tunnel', ({ envelope }) =>
    envelope[1].some(
      ([itemHeader, item]) =>
        itemHeader.type === 'event' && (item as Event).exception?.values?.[0]?.value === 'Tunnel managed cookie test',
    ),
  );

  await page.goto(BASE_PATH);
  await page.waitForFunction(() => typeof (window as { __SENTRY__?: unknown }).__SENTRY__ === 'object');
  const tunnelRequestPromise = page.waitForRequest(
    request =>
      request.method() === 'POST' &&
      new URL(request.url()).origin === baseURL &&
      (request.postData() ?? '').includes('Tunnel managed cookie test'),
  );
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('Tunnel managed cookie test');
    });
  });

  const tunnelRequest = await tunnelRequestPromise;
  const proxyRequest = await proxyRequestPromise;

  expect(isTunnelPath(new URL(tunnelRequest.url()).pathname)).toBe(true);
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

  await page.goto(BASE_PATH);
  await pageloadTunnelResponsePromise;
  // The first flush sends the tunnel spans, the second one the barrier span of the first flush.
  await page.request.get(`${BASE_PATH}/api/flush`);
  await page.request.get(`${BASE_PATH}/api/flush`);
  await barrierSpanPromise;

  // The middleware span of the page request arrived, so the ones of the tunnel requests would have too.
  expect(spansBeforeBarrier.some(span => span.name === 'middleware GET')).toBe(true);

  const postSpans = spansBeforeBarrier.filter(
    span =>
      span.name.includes('POST') ||
      getStringAttribute(span, HTTP_REQUEST_METHOD) === 'POST' ||
      getStringAttribute(span, 'http.method') === 'POST',
  );
  const ingestSpans = spansBeforeBarrier.filter(
    span =>
      getSpanOp(span) === 'http.client' && !!getStringAttribute(span, URL_FULL)?.startsWith('http://localhost:3031/'),
  );
  expect(postSpans).toEqual([]);
  expect(ingestSpans).toEqual([]);
});
