import { expect, test } from '@playwright/test';
import { PAGELOAD } from '@sentry/conventions/op';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { parseSemver } from '@sentry/core';

const nextPackageJson = require('next/package.json');
const nextjsVersion = nextPackageJson.version;
const { major, minor } = parseSemver(nextjsVersion);

const INJECTED_TRACE_ID = '12345678901234567890123456789012';
const INJECTED_PARENT_SPAN_ID = '1234567890123456';

test('Should continue the trace of injected meta tags instead of the server trace in pages router', async ({
  page,
}) => {
  test.skip(
    major === 15 && minor !== undefined && minor < 3,
    'Next.js version does not support clientside instrumentation',
  );

  let serverSentryTrace: string | undefined;

  // Stands in for a mobile SDK that injects the tags into the document of a WebView.
  await page.route('**/123/pages-router-client-trace-propagation', async route => {
    const response = await route.fetch();
    const html = await response.text();
    serverSentryTrace = html.match(/<meta name="sentry-trace" content="([^"]+)"/)?.[1];
    const metaTags =
      `<meta name="sentry-trace" content="${INJECTED_TRACE_ID}-${INJECTED_PARENT_SPAN_ID}-1">` +
      `<meta name="baggage" content="sentry-trace_id=${INJECTED_TRACE_ID},sentry-sampled=true,sentry-sample_rate=1,sentry-environment=qa">`;
    // After the tags Next.js renders for the request, so the order of the tags cannot decide the outcome.
    await route.fulfill({ response, body: html.replace('</head>', `${metaTags}</head>`) });
  });

  const pageloadSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return (
      span.name === '/[locale]/pages-router-client-trace-propagation' && getSpanOp(span) === PAGELOAD && span.is_segment
    );
  });

  await page.goto(`/123/pages-router-client-trace-propagation`);

  const pageloadSpan = await pageloadSpanPromise;

  // The document also carries the tags Next.js rendered for the request, which belong to the server trace.
  expect(serverSentryTrace).toMatch(/^[0-9a-f]{32}-[0-9a-f]{16}/);
  expect(serverSentryTrace).not.toContain(INJECTED_TRACE_ID);
  expect(pageloadSpan.trace_id).toBe(INJECTED_TRACE_ID);
  expect(pageloadSpan.parent_span_id).toBe(INJECTED_PARENT_SPAN_ID);
});
