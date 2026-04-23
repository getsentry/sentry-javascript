import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
import { type SpanJSON } from '@sentry/core';
import { APP_NAME, isNode } from './constants';

// In Node, @sentry/node/preload eagerly activates the OTel HonoInstrumentation,
// which wraps all Hono instance methods at construction time via WrappedHono.
//
// For the *root app*, patchAppUse's Proxy wraps handlers before OTel does
// (Proxy → OTel → Hono internals), so the inner Sentry span preserves the
// original function name and has origin 'auto.middleware.hono'.
//
// For *sub-apps*, OTel wraps handlers at registration time (inside WrappedHono
// constructor) before patchRoute runs at mount time. So patchRoute sees anonymous
// OTel wrappers. The OTel spans carry the correct function names with origin
// 'auto.http.otel.hono'.
const MIDDLEWARE_ORIGIN = 'auto.middleware.hono';
const OTEL_ORIGIN = 'auto.http.otel.hono';

const SCENARIOS = [
  {
    name: 'root app middleware',
    prefix: '/test-middleware',
    origin: MIDDLEWARE_ORIGIN,
  },
  {
    name: 'sub-app middleware (route group)',
    prefix: '/test-subapp-middleware',
    origin: isNode ? OTEL_ORIGIN : MIDDLEWARE_ORIGIN,
  },
] as const;

for (const { name, prefix, origin } of SCENARIOS) {
  test.describe(name, () => {
    test('creates a span for named middleware', async ({ baseURL }) => {
      const transactionPromise = waitForTransaction(APP_NAME, event => {
        return event.contexts?.trace?.op === 'http.server' && event.transaction === `GET ${prefix}/named`;
      });

      const response = await fetch(`${baseURL}${prefix}/named`);
      expect(response.status).toBe(200);

      const transaction = await transactionPromise;
      const spans = transaction.spans || [];

      const middlewareSpan = spans.find(
        (span: { description?: string; op?: string }) =>
          span.op === 'middleware.hono' && span.description === 'middlewareA',
      );

      expect(middlewareSpan).toEqual(
        expect.objectContaining({
          description: 'middlewareA',
          op: 'middleware.hono',
          origin,
          status: 'ok',
        }),
      );

      // @ts-expect-error timestamp is defined
      const durationMs = (middlewareSpan?.timestamp - middlewareSpan?.start_timestamp) * 1000;
      expect(durationMs).toBeGreaterThanOrEqual(49);
    });

    test('creates a span for anonymous middleware', async ({ baseURL }) => {
      const transactionPromise = waitForTransaction(APP_NAME, event => {
        return event.contexts?.trace?.op === 'http.server' && event.transaction === `GET ${prefix}/anonymous`;
      });

      const response = await fetch(`${baseURL}${prefix}/anonymous`);
      expect(response.status).toBe(200);

      const transaction = await transactionPromise;
      const spans = transaction.spans || [];

      expect(spans).toContainEqual(
        expect.objectContaining({
          description: '<anonymous>',
          op: 'middleware.hono',
          origin: MIDDLEWARE_ORIGIN,
          status: 'ok',
        }),
      );
    });

    test('multiple middleware are sibling spans under the same parent', async ({ baseURL }) => {
      test.skip(
        isNode,
        'Node double-instruments middleware (too many spans) - TODO: fix this in the SDK and re-enable the test',
      );

      const transactionPromise = waitForTransaction(APP_NAME, event => {
        return event.contexts?.trace?.op === 'http.server' && event.transaction === `GET ${prefix}/multi`;
      });

      const response = await fetch(`${baseURL}${prefix}/multi`);
      expect(response.status).toBe(200);

      const transaction = await transactionPromise;
      const spans = transaction.spans || [];

      // Sort spans because they are in a different order in Node/Bun (OTel-based)
      const middlewareSpans = spans.sort((a, b) => (a.start_timestamp ?? 0) - (b.start_timestamp ?? 0));

      expect(middlewareSpans).toHaveLength(2);
      expect(middlewareSpans[0]?.description).toBe('middlewareA');
      expect(middlewareSpans[1]?.description).toBe('middlewareB');

      expect(middlewareSpans[0]?.parent_span_id).toBe(middlewareSpans[1]?.parent_span_id);

      // middlewareA has a 50ms delay, middlewareB has a 60ms delay
      // @ts-expect-error timestamp is defined
      const aDurationMs = (middlewareSpans[0]?.timestamp - middlewareSpans[0]?.start_timestamp) * 1000;
      // @ts-expect-error timestamp is defined
      const bDurationMs = (middlewareSpans[1]?.timestamp - middlewareSpans[1]?.start_timestamp) * 1000;
      expect(aDurationMs).toBeGreaterThanOrEqual(49);
      expect(bDurationMs).toBeGreaterThanOrEqual(59);
    });

    test('captures error thrown in middleware', async ({ baseURL }) => {
      const errorPromise = waitForError(APP_NAME, event => {
        return (
          event.exception?.values?.[0]?.value === 'Middleware error' &&
          event.exception?.values?.[0]?.mechanism?.type === 'auto.middleware.hono'
        );
      });

      const response = await fetch(`${baseURL}${prefix}/error`);
      expect(response.status).toBe(500);

      const errorEvent = await errorPromise;
      expect(errorEvent.exception?.values?.[0]?.value).toBe('Middleware error');
      expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual(
        expect.objectContaining({
          handled: false,
          type: 'auto.middleware.hono',
        }),
      );
    });

    test('sets error status on middleware span when middleware throws', async ({ baseURL }) => {
      const transactionPromise = waitForTransaction(APP_NAME, event => {
        return event.contexts?.trace?.op === 'http.server' && event.transaction === `GET ${prefix}/error/*`;
      });

      await fetch(`${baseURL}${prefix}/error`);

      const transaction = await transactionPromise;
      const spans = transaction.spans || [];

      // On the /error path only one middleware (failingMiddleware) is registered,
      // so we can find the error span by status alone. On Node for sub-apps, the
      // OTel layer wraps before patchRoute, so the function name may be lost in
      // the patchRoute span — but the error status is always set.
      const failingSpan = spans.find(
        (span: SpanJSON) => span.op === 'middleware.hono' && span.status === 'internal_error',
      );

      expect(failingSpan).toBeDefined();
      expect(failingSpan?.status).toBe('internal_error');
    });

    test('includes request data on error events from middleware', async ({ baseURL }) => {
      const errorPromise = waitForError(APP_NAME, event => {
        return event.exception?.values?.[0]?.value === 'Middleware error' && !!event.request?.url?.includes(prefix);
      });

      await fetch(`${baseURL}${prefix}/error`);

      const errorEvent = await errorPromise;
      expect(errorEvent.request).toEqual(
        expect.objectContaining({
          method: 'GET',
          url: expect.stringContaining(`${prefix}/error`),
        }),
      );
    });
  });
}

test.describe('.all() handler on sub-app (method ALL edge case)', () => {
  test('.all() handler is instrumented and produces a span', async ({ baseURL }) => {
    const transactionPromise = waitForTransaction(APP_NAME, event => {
      return (
        event.contexts?.trace?.op === 'http.server' && event.transaction === 'GET /test-subapp-middleware/all-handler'
      );
    });

    const response = await fetch(`${baseURL}/test-subapp-middleware/all-handler`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ handler: 'all' });

    const transaction = await transactionPromise;
    const spans = transaction.spans || [];

    if (isNode) {
      // On Node, OTel wraps .all() at construction time. Since the handler
      // returns a Response, OTel classifies it as 'request_handler' (not
      // middleware). patchRoute also wraps it but sees the anonymous OTel wrapper.
      // Either way, the handler IS instrumented — verify any hono span exists.
      const honoSpan = spans.find((span: SpanJSON) => span.op?.endsWith('.hono'));
      expect(honoSpan).toBeDefined();
    } else {
      // On Bun/Cloudflare, patchRoute is the sole wrapper and sees the original
      // function name. It wraps .all() handlers identically to .use() middleware
      // because both produce method:'ALL' in Hono's route record.
      const allHandlerSpan = spans.find(
        (span: SpanJSON) => span.op === 'middleware.hono' && span.description === 'allCatchAll',
      );

      expect(allHandlerSpan).toEqual(
        expect.objectContaining({
          description: 'allCatchAll',
          op: 'middleware.hono',
          origin: MIDDLEWARE_ORIGIN,
          status: 'ok',
        }),
      );
    }
  });
});
