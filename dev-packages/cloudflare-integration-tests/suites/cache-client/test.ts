import type { Envelope, Event } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { createRunner } from '../../runner';

type Mechanism = { type: string; handled: boolean };

/**
 * Matches an error event by exception value and capture mechanism.
 *
 * Callback-style (instead of exact `eventEnvelope` matching) because Durable Object
 * RPC events carry no `request` and their trace context varies with propagation —
 * only the exception payload is stable. Non-matching envelopes (worker-side duplicate
 * captures, transactions) are dropped by the runner's unordered mode.
 */
function errorEventExpectation(value: string, mechanism: Mechanism) {
  return (envelope: Envelope) => {
    const event = envelope[1]?.[0]?.[1] as Event;
    expect(event).toEqual(
      expect.objectContaining({
        level: 'error',
        exception: {
          values: [
            expect.objectContaining({
              type: 'Error',
              value,
              stacktrace: { frames: expect.any(Array) },
              mechanism,
            }),
          ],
        },
      }),
    );
  };
}

const DO_MECHANISM: Mechanism = { type: 'auto.faas.cloudflare.durable_object', handled: false };
// Direct `captureException` calls (not routed through a wrapped handler) always get this mechanism
const CAPTURE_MECHANISM: Mechanism = { type: 'generic', handled: true };

/** span-v2 streamed envelope payload. */
type SpanV2Payload = {
  items?: Array<{
    name?: string;
    trace_id?: string;
    attributes?: Record<string, { value?: unknown }>;
  }>;
};

/**
 * Matches a span-v2 envelope containing at least one span with the given name.
 * Spans are matched loosely because batching can coalesce multiple spans of one
 * trace into a single envelope.
 */
function spanEnvelopeExpectation(spanName: string) {
  return (envelope: Envelope) => {
    const payload = envelope[1]?.[0]?.[1] as SpanV2Payload;
    expect(payload.items?.some(span => span.name === spanName)).toBe(true);
  };
}

it('cacheClient: false - DO handler error is captured', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(errorEventExpectation('No-cache DO handler error from instance-1', DO_MECHANISM))
    .expect(errorEventExpectation('No-cache DO handler error from instance-2', DO_MECHANISM))
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/no-cache/handler-error?id=instance-1', { expectError: true });
  await runner.makeRequest('get', '/no-cache/handler-error?id=instance-2', { expectError: true });
  await runner.completed();
});

it('cacheClient: true - DO handler error is captured', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(errorEventExpectation('Cache DO handler error from instance-1', DO_MECHANISM))
    .expect(errorEventExpectation('Cache DO handler error from instance-2', DO_MECHANISM))
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/cache/handler-error?id=instance-1', { expectError: true });
  await runner.makeRequest('get', '/cache/handler-error?id=instance-2', { expectError: true });
  await runner.completed();
});

it('cacheClient: true - detached work events ARE captured', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(errorEventExpectation('Detached work from cache DO instance-1', CAPTURE_MECHANISM))
    .expect(errorEventExpectation('Detached work from cache DO instance-2', CAPTURE_MECHANISM))
    // Logs batch client-side and the idle drain timer is disabled for this runtime, so a
    // log only ever becomes an envelope if the cached client drains its log buffer on
    // capture. Without that, detached logs are silently dropped while errors still arrive.
    .expect((envelope: Envelope) => {
      const payload = envelope[1]?.[0]?.[1] as { items?: Array<{ body?: string }> };
      expect(payload.items?.some(log => log.body?.startsWith('Detached log: Detached work from cache DO'))).toBe(true);
    })
    // The detached span itself: captured in work that starts after the RPC invocation
    // settled, so it only survives because the cached client delivers it eagerly.
    .expect(spanEnvelopeExpectation('do.detached-task'))
    // The detached metric, delivered via the same eager drain as the span and log.
    .expect((envelope: Envelope) => {
      const payload = envelope[1]?.[0]?.[1] as { items?: Array<{ name?: string }> };
      expect(payload.items?.some(metric => metric.name === 'do.detached')).toBe(true);
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/cache/detached?id=instance-1');
  await runner.makeRequest('get', '/cache/detached?id=instance-2');
  await runner.completed();
});

it('cacheClient: false - repro #22545: detached work events are silently dropped', async ({ signal }) => {
  const runner = createRunner(__dirname).ignore('transaction', 'span').start(signal);

  // Make the request that spawns detached work
  await runner.makeRequest('get', '/no-cache/detached?id=repro-1');

  // With cacheClient: false, the client is disposed after the handler returns,
  // so the detached work's captureException (3s later) is silently dropped.
  // We verify by waiting for the event with a timeout — if it doesn't arrive,
  // the event was silently dropped as expected.
  const result = await Promise.race([
    runner.makeRequestAndWaitForEnvelope('get', '/no-cache/detached?id=repro-2', () => {
      throw new Error('Received an event that should have been dropped with cacheClient: false');
    }),
    // Timeout: resolve with 'timeout' if no event arrives within 5s
    new Promise<string>(resolve => setTimeout(() => resolve('timeout'), 5000)),
  ]);

  // The event should NOT have been received (timeout should win the race)
  expect(result).toBe('timeout');
});

it('cacheClient: true - dedupe drops the same error across invocations', async ({ signal }) => {
  // A shared client shares its dedupe state, so the same error captured by two separate
  // invocations is reported only once — the second is dropped as a duplicate.
  const runner = createRunner(__dirname)
    .ignore('transaction', 'span')
    .unordered()
    .failOnUnexpected()
    .expect(errorEventExpectation('Same error', CAPTURE_MECHANISM))
    .start(signal);

  // All three invocations are made without per-request waiters, while the runner requires the
  // single expected error and rejects if either duplicate is delivered unexpectedly.
  await runner.makeRequest('get', '/cache/dedupe?id=dedupe-shared');
  await runner.makeRequest('get', '/cache/dedupe?id=dedupe-shared');
  await runner.makeRequest('get', '/cache/dedupe?id=dedupe-shared');
  await runner.completed();
});

it('cacheClient: false - dedupe does not persist across invocations', async ({ signal }) => {
  // A fresh client per invocation means fresh dedupe state, so each invocation reports
  // the same error independently.
  const runner = createRunner(__dirname).ignore('transaction', 'span').start(signal);

  for (let i = 0; i < 3; i++) {
    await runner.makeRequestAndWaitForEnvelope(
      'get',
      '/no-cache/dedupe?id=dedupe-fresh',
      errorEventExpectation('Same error', CAPTURE_MECHANISM),
    );
  }
});

// A cached client outlives the invocation that created it, so this checks that reusing it does not
// also start reusing the isolation scope `setTag`/`setUser` write to. The uncached counterpart of
// this test lives in the `durable-object-scope` suite.
it('cacheClient: true - two consecutive invocations get different isolation scopes', async ({ signal }) => {
  const runner = createRunner(__dirname).ignore('transaction', 'span').start(signal);

  await runner.makeRequestAndWaitForEnvelope('get', '/cache/scope?id=scope-shared&seed=1', (envelope: Envelope) => {
    const event = envelope[1]?.[0]?.[1] as Event;
    expect(event.exception?.values?.[0]?.value).toBe('Cache scope seed');
    // Guards the probe assertions below against passing vacuously.
    expect(event.tags).toEqual(expect.objectContaining({ seeded_tag: 'from-seeding-call' }));
    expect(event.user).toEqual({ id: 'user-from-seeding-call' });
  });

  await runner.makeRequestAndWaitForEnvelope('get', '/cache/scope?id=scope-shared&seed=0', (envelope: Envelope) => {
    const event = envelope[1]?.[0]?.[1] as Event;
    expect(event.exception?.values?.[0]?.value).toBe('Cache scope probe');
    expect(event.tags?.seeded_tag).toBeUndefined();
    expect(event.user).toBeUndefined();
  });
});

it('cacheClient: true - streaming response works with shared client', async ({ signal }) => {
  // A streamed request produces two span envelopes — the DO's own `GET /streaming` and the
  // outer worker's `GET /cache/streaming` — and their arrival order is not guaranteed. Accept
  // either, since the point is that spans still reach the transport at all.
  const streamingSpanExpectation = (envelope: Envelope) => {
    const payload = envelope[1]?.[0]?.[1] as { items?: Array<{ name?: string }> };
    expect(payload.items?.map(span => span.name)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^GET \/(cache\/)?streaming$/)]),
    );
  };

  const runner = createRunner(__dirname).start(signal);

  // Waiting per request keeps the runner alive for the second one: with both
  // expectations queued up front it completes on the first request's spans and
  // tears down before the second is sent.
  for (let i = 0; i < 2; i++) {
    const text = await runner.makeRequestAndWaitForEnvelope<string>(
      'get',
      '/cache/streaming',
      streamingSpanExpectation,
    );
    expect(text).toBe('chunk1chunk2');
  }
});

// Sync KV and SQL instrumentation produces child `db` spans inside the Durable Object. A cached
// client never reaches an invocation-boundary flush, so these only arrive if the eager drain
// covers spans too — the uncached mode is the control that the routes themselves are sound.
describe('durable object storage spans', () => {
  // span-v2 wraps every attribute value as `{ value, type }`.
  type SpanV2 = { name?: string; attributes?: Record<string, { value?: unknown }> };

  const dbSpanNames = (envelope: Envelope): string[] => {
    const payload = envelope[1]?.[0]?.[1] as { items?: SpanV2[] };
    return (payload.items ?? [])
      .filter(span => span.attributes?.['db.system.name']?.value === 'cloudflare-durable-object-sql')
      .map(span => span.name ?? '');
  };

  for (const mode of ['cache', 'no-cache'] as const) {
    it(`cacheClient: ${mode === 'cache'} - db spans are delivered`, async ({ signal }) => {
      // The DO's span envelope and the outer worker's arrive in either order, so match
      // unordered rather than asserting on whichever comes first.
      const runner = createRunner(__dirname)
        .expect((envelope: Envelope) => {
          expect(dbSpanNames(envelope)).toEqual([
            'durable_object_storage_kv_put',
            'durable_object_storage_kv_get',
            'durable_object_storage_kv_list',
            'durable_object_storage_kv_delete',
            'CREATE TABLE users',
            'INSERT users',
            'SELECT users',
          ]);
        })
        .unordered()
        .start(signal);

      await runner.makeRequest('get', `/${mode}/storage?id=storage-${mode}`);
      await runner.completed();
    });
  }
});

it('cacheClient: true - multiple DO instances share the same client', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(errorEventExpectation('Cache DO handler error from instance-1', DO_MECHANISM))
    .expect(errorEventExpectation('Cache DO handler error from instance-2', DO_MECHANISM))
    .unordered()
    .start(signal);

  // Two different DO instances — both should capture errors
  await runner.makeRequest('get', '/cache/handler-error?id=instance-1', { expectError: true });
  await runner.makeRequest('get', '/cache/handler-error?id=instance-2', { expectError: true });
  await runner.completed();
});

// The worker-side half of #22545: work registered via ctx.waitUntil finishes after
// the response and after the invocation's flush point, so the spans/log/metric/error
// are only delivered because the cached client drains them eagerly.
it('cacheClient: true - post-response waitUntil work delivers spans, log, metric and error', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(spanEnvelopeExpectation('checkout.post-response'))
    .expect(spanEnvelopeExpectation('checkout.notify-webhook'))
    .expect(errorEventExpectation('Webhook delivery failed', CAPTURE_MECHANISM))
    .expect((envelope: Envelope) => {
      const payload = envelope[1]?.[0]?.[1] as { items?: Array<{ body?: string }> };
      expect(payload.items?.some(log => log.body === 'checkout post-response log')).toBe(true);
    })
    .expect((envelope: Envelope) => {
      const payload = envelope[1]?.[0]?.[1] as { items?: Array<{ name?: string }> };
      expect(payload.items?.some(metric => metric.name === 'checkout.processed')).toBe(true);
    })
    .unordered()
    .start(signal);

  const text = await runner.makeRequest<string>('get', '/post-response?id=checkout-1');
  expect(text).toBe('checkout accepted');
  await runner.completed();
});

// One request fans out into N sequential DO RPC calls. Each RPC span must be
// delivered and must belong to the worker request's trace (RPC trace propagation).
it('cacheClient: true - burst DO RPC span shares the worker request trace', async ({ signal }) => {
  let workerTraceId: string | undefined;
  const echoTraceIds = new Set<string>();

  const runner = createRunner(__dirname)
    .expect((envelope: Envelope) => {
      const payload = envelope[1]?.[0]?.[1] as SpanV2Payload;
      const echoSpans = (payload.items ?? []).filter(span => span.name === 'echo');
      expect(echoSpans.length).toBeGreaterThan(0);
      for (const span of echoSpans) {
        expect(span.attributes?.['sentry.op']?.value).toBe('rpc');
        expect(span.trace_id).toBeDefined();
        echoTraceIds.add(span.trace_id!);
      }
    })
    .expect((envelope: Envelope) => {
      const payload = envelope[1]?.[0]?.[1] as SpanV2Payload;
      const root = payload.items?.find(span => span.name === 'GET /burst');
      expect(root).toBeDefined();
      expect(root?.attributes?.['sentry.op']?.value).toBe('http.server');
      workerTraceId = root?.trace_id;
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/burst?n=1&id=fanout');
  await runner.completed();

  expect(workerTraceId).toBeDefined();
  expect(echoTraceIds.size).toBe(1);
  expect([...echoTraceIds][0]).toBe(workerTraceId);
});
