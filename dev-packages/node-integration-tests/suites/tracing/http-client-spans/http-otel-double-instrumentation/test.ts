import { createTestServer } from '@sentry-internal/test-utils';
import { expect, test } from 'vitest';
import { createRunner } from '../../../../utils/runner';

test('registers double spans when OTel HttpInstrumentation is also active — documents known issue', async () => {
  const [SERVER_URL, closeTestServer] = await createTestServer()
    .get('/api/v0', () => {})
    .start();

  await createRunner(__dirname, 'scenario.ts')
    .withEnv({ SERVER_URL })
    .expect({
      transaction: txn => {
        expect(txn.transaction).toBe('test_transaction');

        const httpClientSpans = (txn.spans ?? []).filter(s => s.op === 'http.client');

        // PROBLEM: two http.client spans are produced for a single
        // outgoing request when @opentelemetry/instrumentation-http runs
        // alongside Sentry.
        //
        // - OTel's HttpInstrumentation monkey-patches http.request and
        //   creates an OTel span; Sentry's SentrySpanProcessor converts that
        //   to a Sentry span.
        // - On Node >=22.12 Sentry's SentryHttpInstrumentation additionally
        //   subscribes to the http.client.request.created diagnostic channel.
        //   The channel fires inside OTel's already-patched http.request,
        //   triggering Sentry to create a *second* http.client span as a
        //   child of the first.
        // - On Node <22.12 both instrumentations monkey-patch http.request,
        //   so both wrappers fire and each creates its own span.
        //
        // MITIGATION: pass `spans: false` to httpIntegration() so Sentry
        // defers all outgoing span creation to OTel's HttpInstrumentation
        // (whose spans Sentry already captures via SentrySpanProcessor).
        //
        // See the 'mitigation' scenario alongside this test.
        expect(httpClientSpans).toHaveLength(2);

        // The outer span comes from OTel HttpInstrumentation (no Sentry
        // origin). The inner span is the one Sentry's own handler creates;
        // it is a *child* of the outer span with origin 'auto.http.client'.
        const sentrySpan = httpClientSpans.find(s => s.data?.['sentry.origin'] === 'auto.http.client');
        const otelSpan = httpClientSpans.find(s => s.data?.['sentry.origin'] !== 'auto.http.client');

        expect(sentrySpan).toBeDefined();
        expect(otelSpan).toBeDefined();

        // the sentry-created span is nested inside the otel-created span.
        expect(sentrySpan!.parent_span_id).toBe(otelSpan!.span_id);
      },
    })
    .start()
    .completed();

  closeTestServer();
});

test('mitigation: spans: false on httpIntegration prevents double-instrumentation', async () => {
  const [SERVER_URL, closeTestServer] = await createTestServer()
    .get('/api/v0', () => {})
    .start();

  await createRunner(__dirname, 'scenario-mitigation.ts')
    .withEnv({ SERVER_URL })
    .expect({
      transaction: txn => {
        expect(txn.transaction).toBe('test_transaction');

        const httpClientSpans = (txn.spans ?? []).filter(s => s.op === 'http.client');
        // With spans: false in httpIntegration(), Sentry does not create its
        // own span.  OTel's HttpInstrumentation still creates one, which
        // flows through SentrySpanProcessor, so there is exactly one
        // http.client span.
        expect(httpClientSpans).toHaveLength(1);
        expect(httpClientSpans[0]).toMatchObject({
          description: expect.stringMatching(/GET .*\/api\/v0/),
          status: 'ok',
        });
      },
    })
    .start()
    .completed();

  closeTestServer();
});
