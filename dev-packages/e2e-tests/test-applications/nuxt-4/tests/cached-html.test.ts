import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe('Rendering Modes with Cached HTML', () => {
  test('changes tracing meta tags with multiple requests on ISR-cached page', async ({ page }) => {
    // === 1. Request ===
    const clientTxnEventPromise1 = waitForTransaction('nuxt-4', txnEvent => {
      return txnEvent.transaction === '/rendering-modes/isr-cached-page';
    });

    const serverTxnEventPromise1 = waitForTransaction('nuxt-4', txnEvent => {
      return txnEvent.transaction?.includes('GET /rendering-modes/isr-cached-page') ?? false;
    });

    const [_1, clientTxnEvent1, serverTxnEvent1] = await Promise.all([
      page.goto(`/rendering-modes/isr-cached-page`),
      clientTxnEventPromise1,
      serverTxnEventPromise1,
      expect(page.getByText(`ISR Cached Page`, { exact: true })).toBeVisible(),
    ]);

    const baggageMetaTagContent1 = await page.locator('meta[name="baggage"]').getAttribute('content');
    const sentryTraceMetaTagContent1 = await page.locator('meta[name="sentry-trace"]').getAttribute('content');
    const [htmlMetaTraceId1] = sentryTraceMetaTagContent1?.split('-') || [];

    // === 2. Request ===

    const clientTxnEventPromise2 = waitForTransaction('nuxt-4', txnEvent => {
      return txnEvent.transaction === '/rendering-modes/isr-cached-page';
    });

    const serverTxnEventPromise2 = waitForTransaction('nuxt-4', txnEvent => {
      return txnEvent.transaction?.includes('GET /rendering-modes/isr-cached-page') ?? false;
    });

    const [_2, clientTxnEvent2, serverTxnEvent2] = await Promise.all([
      page.goto(`/rendering-modes/isr-cached-page`),
      clientTxnEventPromise2,
      serverTxnEventPromise2,
      expect(page.getByText(`ISR Cached Page`, { exact: true })).toBeVisible(),
    ]);

    const baggageMetaTagContent2 = await page.locator('meta[name="baggage"]').getAttribute('content');
    const sentryTraceMetaTagContent2 = await page.locator('meta[name="sentry-trace"]').getAttribute('content');
    const [htmlMetaTraceId2] = sentryTraceMetaTagContent2?.split('-') || [];

    const serverTxnEvent1TraceId = serverTxnEvent1.contexts?.trace?.trace_id;
    const serverTxnEvent2TraceId = serverTxnEvent2.contexts?.trace?.trace_id;

    console.log('Server Transaction 1:', serverTxnEvent1TraceId);
    console.log('Server Transaction 2:', serverTxnEvent2TraceId);

    await test.step('Test distributed trace from 1. request', () => {
      expect(baggageMetaTagContent1).toContain(`sentry-trace_id=${serverTxnEvent1TraceId}`);

      expect(clientTxnEvent1.contexts?.trace?.trace_id).toBe(serverTxnEvent1TraceId);
      expect(clientTxnEvent1.contexts?.trace?.parent_span_id).toBe(serverTxnEvent1.contexts?.trace?.span_id);
      expect(serverTxnEvent1.contexts?.trace?.trace_id).toBe(htmlMetaTraceId1);
    });

    await test.step('Test distributed trace from 2. request', () => {
      expect(baggageMetaTagContent2).toContain(`sentry-trace_id=${serverTxnEvent2TraceId}`);

      expect(clientTxnEvent2.contexts?.trace?.trace_id).toBe(serverTxnEvent2TraceId);
      expect(clientTxnEvent2.contexts?.trace?.parent_span_id).toBe(serverTxnEvent2.contexts?.trace?.span_id);
      expect(serverTxnEvent2.contexts?.trace?.trace_id).toBe(htmlMetaTraceId2);
    });

    await test.step('Test that trace IDs from subsequent requests are different', () => {
      // Different trace IDs for the server transactions
      expect(serverTxnEvent1TraceId).not.toBe(serverTxnEvent2TraceId);
      expect(serverTxnEvent1TraceId).not.toBe(htmlMetaTraceId2);
    });
  });

  test('exclude tracing meta tags on SWR-cached page', async ({ page }) => {
    // === 1. Request ===
    const clientTxnEventPromise1 = waitForTransaction('nuxt-4', txnEvent => {
      return txnEvent.transaction === '/rendering-modes/swr-cached-page';
    });

    // Only the 1. request creates a server transaction
    const serverTxnEventPromise1 = waitForTransaction('nuxt-4', txnEvent => {
      return txnEvent.transaction?.includes('GET /rendering-modes/swr-cached-page') ?? false;
    });

    const [_1, clientTxnEvent1, serverTxnEvent1] = await Promise.all([
      page.goto(`/rendering-modes/swr-cached-page`),
      clientTxnEventPromise1,
      serverTxnEventPromise1,
      expect(page.getByText(`SWR Cached Page`, { exact: true })).toBeVisible(),
    ]);

    await test.step('No baggage and sentry-trace meta tags are present on first request', async () => {
      expect(await page.locator('meta[name="baggage"]').count()).toBe(0);
      expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);
    });

    // === 2. Request ===

    await page.goto(`/rendering-modes/swr-cached-page`);

    const clientTxnEventPromise2 = waitForTransaction('nuxt-4', txnEvent => {
      return txnEvent.transaction === '/rendering-modes/swr-cached-page';
    });

    let serverTxnEvent2 = undefined;
    const serverTxnEventPromise2 = Promise.race([
      waitForTransaction('nuxt-4', txnEvent => {
        return txnEvent.transaction?.includes('GET /rendering-modes/swr-cached-page') ?? false;
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('No second server transaction expected')), 2000)),
    ]);

    try {
      serverTxnEvent2 = await serverTxnEventPromise2;
      throw new Error('Second server transaction should not have been sent');
    } catch (error) {
      expect(error.message).toBe('No second server transaction expected');
    }

    const [clientTxnEvent2] = await Promise.all([
      clientTxnEventPromise2,
      expect(page.getByText(`SWR Cached Page`, { exact: true })).toBeVisible(),
    ]);

    const clientTxnEvent1TraceId = clientTxnEvent1.contexts?.trace?.trace_id;
    const clientTxnEvent2TraceId = clientTxnEvent2.contexts?.trace?.trace_id;

    const serverTxnEvent1TraceId = serverTxnEvent1.contexts?.trace?.trace_id;
    const serverTxnEvent2TraceId = serverTxnEvent2?.contexts?.trace?.trace_id;

    await test.step('No baggage and sentry-trace meta tags are present on first request', async () => {
      expect(await page.locator('meta[name="baggage"]').count()).toBe(0);
      expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);
    });

    await test.step('First Server Transaction and all Client Transactions are defined', () => {
      expect(serverTxnEvent1TraceId).toBeDefined();
      expect(clientTxnEvent1TraceId).toBeDefined();
      expect(clientTxnEvent2TraceId).toBeDefined();
      expect(serverTxnEvent2).toBeUndefined();
      expect(serverTxnEvent2TraceId).toBeUndefined();
    });

    await test.step('Trace is not distributed', () => {
      // Cannot create distributed trace as HTML Meta Tags are not added (SWR caching leads to multiple usages of the same server trace id)
      expect(clientTxnEvent1TraceId).not.toBe(clientTxnEvent2TraceId);
      expect(clientTxnEvent1TraceId).not.toBe(serverTxnEvent1TraceId);
    });
  });

  test('exclude tracing meta tags on pre-rendered page', async ({ page }) => {
    // === 1. Request ===
    const clientTxnEventPromise1 = waitForTransaction('nuxt-4', txnEvent => {
      return txnEvent.transaction === '/rendering-modes/pre-rendered-page';
    });

    // Only the 1. request creates a server transaction
    const serverTxnEventPromise1 = waitForTransaction('nuxt-4', txnEvent => {
      return txnEvent.transaction?.includes('GET /rendering-modes/pre-rendered-page') ?? false;
    });

    const [_1, clientTxnEvent1, serverTxnEvent1] = await Promise.all([
      page.goto(`/rendering-modes/pre-rendered-page`),
      clientTxnEventPromise1,
      serverTxnEventPromise1,
      expect(page.getByText(`Pre-Rendered Page`, { exact: true })).toBeVisible(),
    ]);

    await test.step('No baggage and sentry-trace meta tags are present on first request', async () => {
      expect(await page.locator('meta[name="baggage"]').count()).toBe(0);
      expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);
    });

    // === 2. Request ===

    await page.goto(`/rendering-modes/pre-rendered-page`);

    const clientTxnEventPromise2 = waitForTransaction('nuxt-4', txnEvent => {
      return txnEvent.transaction === '/rendering-modes/pre-rendered-page';
    });

    let serverTxnEvent2 = undefined;
    const serverTxnEventPromise2 = Promise.race([
      waitForTransaction('nuxt-4', txnEvent => {
        return txnEvent.transaction?.includes('GET /rendering-modes/pre-rendered-page') ?? false;
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('No second server transaction expected')), 2000)),
    ]);

    try {
      serverTxnEvent2 = await serverTxnEventPromise2;
      throw new Error('Second server transaction should not have been sent');
    } catch (error) {
      expect(error.message).toBe('No second server transaction expected');
    }

    const [clientTxnEvent2] = await Promise.all([
      clientTxnEventPromise2,
      expect(page.getByText(`Pre-Rendered Page`, { exact: true })).toBeVisible(),
    ]);

    const clientTxnEvent1TraceId = clientTxnEvent1.contexts?.trace?.trace_id;
    const clientTxnEvent2TraceId = clientTxnEvent2.contexts?.trace?.trace_id;

    const serverTxnEvent1TraceId = serverTxnEvent1.contexts?.trace?.trace_id;
    const serverTxnEvent2TraceId = serverTxnEvent2?.contexts?.trace?.trace_id;

    await test.step('No baggage and sentry-trace meta tags are present on first request', async () => {
      expect(await page.locator('meta[name="baggage"]').count()).toBe(0);
      expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);
    });

    await test.step('First Server Transaction and all Client Transactions are defined', () => {
      expect(serverTxnEvent1TraceId).toBeDefined();
      expect(clientTxnEvent1TraceId).toBeDefined();
      expect(clientTxnEvent2TraceId).toBeDefined();
      expect(serverTxnEvent2).toBeUndefined();
      expect(serverTxnEvent2TraceId).toBeUndefined();
    });

    await test.step('Trace is not distributed', () => {
      // Cannot create distributed trace as HTML Meta Tags are not added (pre-rendering leads to multiple usages of the same server trace id)
      expect(clientTxnEvent1TraceId).not.toBe(clientTxnEvent2TraceId);
      expect(clientTxnEvent1TraceId).not.toBe(serverTxnEvent1TraceId);
    });
  });
});
