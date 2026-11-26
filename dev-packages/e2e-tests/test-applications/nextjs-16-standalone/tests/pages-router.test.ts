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
  // Stands in for a mobile SDK that injects the tags into the document of a WebView. They go after the tags Next.js
  // renders for the request, so the order of the tags cannot decide the outcome. Rewriting the response instead is
  // not an option: Chrome denies a document fulfilled by Playwright the requests to the event proxy on localhost.
  await page.addInitScript(
    ({ sentryTrace, baggage }) => {
      const observer = new MutationObserver(() => {
        const head = document.head;
        if (!head?.querySelector('meta[name="sentry-trace"]') || !head.querySelector('meta[name="baggage"]')) {
          return;
        }
        observer.disconnect();
        for (const [name, content] of [
          ['sentry-trace', sentryTrace],
          ['baggage', baggage],
        ] as const) {
          const meta = document.createElement('meta');
          meta.name = name;
          meta.content = content;
          head.appendChild(meta);
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    },
    {
      sentryTrace: `${INJECTED_TRACE_ID}-${INJECTED_PARENT_SPAN_ID}-1`,
      baggage: `sentry-trace_id=${INJECTED_TRACE_ID},sentry-sampled=true,sentry-sample_rate=1,sentry-environment=qa`,
    },
  );

  const pageloadSpanPromise = waitForStreamedSpan('nextjs-16-standalone', span => {
    return span.name === '/pages-router-ssr' && getSpanOp(span) === PAGELOAD && span.is_segment;
  });

  await page.goto('/pages-router-ssr');

  const pageloadSpan = await pageloadSpanPromise;

  const sentryTraceTags = await page
    .locator('meta[name="sentry-trace"]')
    .evaluateAll(tags => tags.map(tag => tag.getAttribute('content')));

  expect(sentryTraceTags).toHaveLength(2);
  expect(sentryTraceTags[0]).not.toContain(INJECTED_TRACE_ID);
  expect(sentryTraceTags[1]).toContain(INJECTED_TRACE_ID);
  expect(pageloadSpan.trace_id).toBe(INJECTED_TRACE_ID);
  expect(pageloadSpan.parent_span_id).toBe(INJECTED_PARENT_SPAN_ID);
});
