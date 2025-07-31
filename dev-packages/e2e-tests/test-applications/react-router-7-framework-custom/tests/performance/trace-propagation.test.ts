import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('Trace propagation', () => {
  test('should inject metatags in ssr pageload', async ({ page }) => {
    await page.goto(`/`);
    const sentryTraceContent = await page.getAttribute('meta[name="sentry-trace"]', 'content');
    expect(sentryTraceContent).toBeDefined();
    expect(sentryTraceContent).toMatch(/^[a-f0-9]{32}-[a-f0-9]{16}-[01]$/);
    const baggageContent = await page.getAttribute('meta[name="baggage"]', 'content');
    expect(baggageContent).toBeDefined();
    expect(baggageContent).toContain('sentry-environment=qa');
    expect(baggageContent).toContain('sentry-public_key=');
    expect(baggageContent).toContain('sentry-trace_id=');
    expect(baggageContent).toContain('sentry-transaction=');
    expect(baggageContent).toContain('sentry-sampled=');
  });

  test('should have trace connection', async ({ page }) => {
    const serverTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET *';
    });

    const clientTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === '/';
    });

    await page.goto(`/`);
    const serverTx = await serverTxPromise;
    const clientTx = await clientTxPromise;

    expect(clientTx.contexts?.trace?.trace_id).toEqual(serverTx.contexts?.trace?.trace_id);

    const requestHandlerSpan = serverTx.spans?.find(span => span.op === 'request_handler.express');

    expect(requestHandlerSpan).toBeDefined();
    expect(clientTx.contexts?.trace?.parent_span_id).toBe(requestHandlerSpan?.span_id);
  });

  test('should not have trace connection for prerendered pages', async ({ page }) => {
    await page.goto('/performance/static');

    const sentryTraceElement = await page.$('meta[name="sentry-trace"]');
    expect(sentryTraceElement).toBeNull();
  });
});
