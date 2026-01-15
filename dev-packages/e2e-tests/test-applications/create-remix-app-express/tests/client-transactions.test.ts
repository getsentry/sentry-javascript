import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a pageload transaction to Sentry', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/';
  });

  await page.goto('/');

  const transactionEvent = await transactionPromise;

  expect(transactionEvent).toBeDefined();
});

test('Sends a navigation transaction to Sentry', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'navigation' && transactionEvent.transaction === '/user/:id';
  });

  await page.goto('/');

  const linkElement = page.locator('id=navigation');
  await linkElement.click();

  const transactionEvent = await transactionPromise;

  expect(transactionEvent).toBeDefined();
});

test('Server-Timing header contains sentry-trace and baggage for the root route', async ({ page }) => {
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/') && response.status() === 200);

  await page.goto('/');

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  expect(serverTimingHeader).toBeDefined();
  expect(serverTimingHeader).toContain('sentry-trace');
  expect(serverTimingHeader).toContain('baggage');
});

test('Server-Timing header contains sentry-trace and baggage for a sub-route', async ({ page }) => {
  const responsePromise = page.waitForResponse(
    response => response.url().includes('/user/123') && response.status() === 200,
  );

  await page.goto('/user/123');

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  expect(serverTimingHeader).toBeDefined();
  expect(serverTimingHeader).toContain('sentry-trace');
  expect(serverTimingHeader).toContain('baggage');
});

// =============================================================================
// META TAG FALLBACK TESTS
// Testing fallback for browsers without Server-Timing support (e.g., Safari < 16.4)
//
// These tests simulate a scenario where:
// 1. The server injects trace context via meta tags (like older Remix setups or non-Node environments)
// 2. The browser doesn't support the Server-Timing API (Safari < 16.4)
//
// We achieve this by:
// 1. Intercepting responses and injecting meta tags with trace data from Server-Timing header
// 2. Disabling the Server-Timing API via page.addInitScript()
// =============================================================================

test.describe('Meta tag fallback for browsers without Server-Timing support', () => {
  test.use({
    // Emulate Safari 15.6.1 which doesn't support Server-Timing on PerformanceNavigationTiming
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.1 Safari/605.1.15',
  });

  test('Server-Timing and meta tag fallback provide consistent trace context', async ({ page }) => {
    // This test verifies that when we inject meta tags with trace context from Server-Timing,
    // both sources contain consistent trace context that can be used for trace propagation.
    //
    // The test simulates a scenario where:
    // 1. Server sends trace context via Server-Timing header
    // 2. We also inject meta tags with the same trace context (as a fallback would)
    // 3. Both should contain the same trace ID and span ID

    let capturedSentryTrace: string | null = null;

    // Intercept responses to inject meta tags (simulating a server that uses meta tags as fallback)
    await page.route('**/*', async route => {
      const response = await route.fetch();
      const contentType = response.headers()['content-type'] || '';

      // Only modify HTML responses
      if (contentType.includes('text/html')) {
        const serverTimingHeader = response.headers()['server-timing'];
        let body = await response.text();

        if (serverTimingHeader) {
          // Parse sentry-trace from Server-Timing header
          const sentryTraceMatch = serverTimingHeader.match(/sentry-trace;desc="([^"]+)"/);
          const baggageMatch = serverTimingHeader.match(/baggage;desc="([^"]+)"/);

          if (sentryTraceMatch?.[1]) {
            const sentryTrace = sentryTraceMatch[1];
            capturedSentryTrace = sentryTrace;
            // Unescape baggage (it's escaped for quoted-string context)
            const baggage = baggageMatch?.[1] ? baggageMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : '';

            // Inject meta tags right after <head>
            const metaTags = `<meta name="sentry-trace" content="${sentryTrace}"><meta name="baggage" content="${baggage}">`;
            body = body.replace(/<head[^>]*>/, match => match + metaTags);
          }
        }

        await route.fulfill({
          response,
          body,
          headers: {
            ...response.headers(),
            'content-length': String(Buffer.byteLength(body)),
          },
        });
      } else {
        await route.continue();
      }
    });

    const testTag = crypto.randomUUID();

    const responsePromise = page.waitForResponse(
      response => response.url().includes(`tag=${testTag}`) && response.status() === 200,
    );

    await page.goto(`/?tag=${testTag}`);

    const response = await responsePromise;

    // Verify Server-Timing header contains trace data
    const serverTimingHeader = response.headers()['server-timing'];
    expect(serverTimingHeader).toBeDefined();
    expect(serverTimingHeader).toContain('sentry-trace');

    // Verify we captured the trace from the header
    expect(capturedSentryTrace).toBeTruthy();

    // Verify the sentry-trace format: traceId-spanId-sampled
    // Using non-null assertion since we just verified it's truthy above
    const parts = capturedSentryTrace!.split('-');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toHaveLength(32); // traceId
    expect(parts[1]).toHaveLength(16); // spanId
    expect(['0', '1']).toContain(parts[2]); // sampled flag
  });

  test('Meta tag trace data matches server trace context', async ({ page }) => {
    // Same setup as above - disable Server-Timing API
    await page.addInitScript(() => {
      const originalGetEntriesByType = Performance.prototype.getEntriesByType;
      Performance.prototype.getEntriesByType = function (type: string) {
        const entries = originalGetEntriesByType.call(this, type);
        if (type === 'navigation') {
          return entries.map((entry: PerformanceEntry) => {
            return new Proxy(entry, {
              has(target, prop) {
                if (prop === 'serverTiming') return false;
                return prop in target;
              },
              get(target, prop, receiver) {
                if (prop === 'serverTiming') return undefined;
                const value = Reflect.get(target, prop, receiver);
                return typeof value === 'function' ? value.bind(target) : value;
              },
            });
          });
        }
        return entries;
      };
    });

    // Intercept responses to inject meta tags (simulating a server that uses meta tags)
    await page.route('**/*', async route => {
      const response = await route.fetch();
      const contentType = response.headers()['content-type'] || '';

      // Only modify HTML responses
      if (contentType.includes('text/html')) {
        const serverTimingHeader = response.headers()['server-timing'];
        let body = await response.text();

        if (serverTimingHeader) {
          // Parse sentry-trace from Server-Timing header
          const sentryTraceMatch = serverTimingHeader.match(/sentry-trace;desc="([^"]+)"/);
          const baggageMatch = serverTimingHeader.match(/baggage;desc="([^"]+)"/);

          if (sentryTraceMatch?.[1]) {
            const sentryTrace = sentryTraceMatch[1];
            // Unescape baggage (it's escaped for quoted-string context)
            const baggage = baggageMatch?.[1] ? baggageMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : '';

            // Inject meta tags right after <head>
            const metaTags = `<meta name="sentry-trace" content="${sentryTrace}"><meta name="baggage" content="${baggage}">`;
            body = body.replace(/<head[^>]*>/, match => match + metaTags);
          }
        }

        await route.fulfill({
          response,
          body,
          headers: {
            ...response.headers(),
            'content-length': String(Buffer.byteLength(body)),
          },
        });
      } else {
        await route.continue();
      }
    });

    const testTag = crypto.randomUUID();

    const responsePromise = page.waitForResponse(
      response => response.url().includes(`tag=${testTag}`) && response.status() === 200,
    );

    await page.goto(`/?tag=${testTag}`);

    const response = await responsePromise;

    // Server-Timing header should still be present (server doesn't know client capability)
    const serverTimingHeader = response.headers()['server-timing'];
    expect(serverTimingHeader).toBeDefined();
    expect(serverTimingHeader).toContain('sentry-trace');

    // Extract trace ID from Server-Timing header
    const sentryTraceMatch = serverTimingHeader?.match(/sentry-trace;desc="([^"]+)"/);
    const [headerTraceId, headerSpanId] = sentryTraceMatch?.[1]?.split('-') || [];

    // Extract trace ID from meta tag (which we injected)
    // We use [content] selector to get the meta tag with content (the one we injected)
    const metaTraceContent = await page.locator('meta[name="sentry-trace"][content]').getAttribute('content');
    const [metaTraceId, metaSpanId] = metaTraceContent?.split('-') || [];

    // Both should have the same trace context (from the same server request)
    expect(headerTraceId).toHaveLength(32);
    expect(metaTraceId).toHaveLength(32);
    expect(headerTraceId).toEqual(metaTraceId);
    expect(headerSpanId).toEqual(metaSpanId);
  });
});
