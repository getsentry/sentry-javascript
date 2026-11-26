import { expect, test } from '@playwright/test';
import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { HTTP_SERVER, PAGELOAD } from '@sentry/conventions/op';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('continues the server trace in the pageload of a Pages Router page', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('nextjs-16-standalone', span => {
    return span.name === 'GET /pages-router-ssr' && getSpanOp(span) === HTTP_SERVER && span.is_segment;
  });

  const pageloadSpanPromise = waitForStreamedSpan('nextjs-16-standalone', span => {
    return span.name === '/pages-router-ssr' && getSpanOp(span) === PAGELOAD && span.is_segment;
  });

  await page.goto('/pages-router-ssr');

  const serverSpan = await serverSpanPromise;
  const pageloadSpan = await pageloadSpanPromise;

  expect(serverSpan.trace_id).toBeDefined();
  expect(pageloadSpan.trace_id).toBe(serverSpan.trace_id);
  expect(pageloadSpan.attributes[SENTRY_ORIGIN]?.value).toBe('auto.pageload.nextjs.pages_router_instrumentation');
});

const INJECTED_TRACE_ID = '12345678901234567890123456789012';
const INJECTED_PARENT_SPAN_ID = '1234567890123456';

test('continues the trace of injected meta tags instead of the server trace in a Pages Router page', async ({
  page,
}) => {
  // Stands in for a mobile SDK that injects the tags into the document of a WebView.
  await page.route('**/pages-router-ssr', async route => {
    const response = await route.fetch();
    const html = await response.text();
    const metaTags =
      `<meta name="sentry-trace" content="${INJECTED_TRACE_ID}-${INJECTED_PARENT_SPAN_ID}-1">` +
      `<meta name="baggage" content="sentry-trace_id=${INJECTED_TRACE_ID},sentry-sampled=true,sentry-sample_rate=1,sentry-environment=qa">`;
    // After the tags Next.js renders for the request, so the order of the tags cannot decide the outcome.
    await route.fulfill({ response, body: html.replace('</head>', `${metaTags}</head>`) });
  });

  const serverSpanPromise = waitForStreamedSpan('nextjs-16-standalone', span => {
    return span.name === 'GET /pages-router-ssr' && getSpanOp(span) === HTTP_SERVER && span.is_segment;
  });

  const pageloadSpanPromise = waitForStreamedSpan('nextjs-16-standalone', span => {
    return span.name === '/pages-router-ssr' && getSpanOp(span) === PAGELOAD && span.is_segment;
  });

  await page.goto('/pages-router-ssr');

  const serverSpan = await serverSpanPromise;
  const pageloadSpan = await pageloadSpanPromise;

  expect(serverSpan.trace_id).not.toBe(INJECTED_TRACE_ID);
  expect(pageloadSpan.trace_id).toBe(INJECTED_TRACE_ID);
  expect(pageloadSpan.parent_span_id).toBe(INJECTED_PARENT_SPAN_ID);
});
