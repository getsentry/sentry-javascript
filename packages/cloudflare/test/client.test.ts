import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils/no-diagnostic-channels';
import { CloudflareClient, type CloudflareClientOptions } from '../src/client';
import { makeFlushLock } from '../src/flush';
import { getInvocationState } from '../src/utils/invocationContext';
import { withInvocationIsolationScope } from '../src/utils/invocationScope';

const TRACE_FLAG_SAMPLED = 0x1;

const MOCK_CLIENT_OPTIONS: CloudflareClientOptions = {
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  stackParser: () => [],
  integrations: [],
  // These tests exercise the per-invocation client behavior
  cacheClient: false,
  transport: () => ({
    send: vi.fn().mockResolvedValue({}),
    flush: vi.fn().mockResolvedValue(true),
  }),
};

describe('CloudflareClient', () => {
  beforeAll(() => {
    setAsyncLocalStorageAsyncContextStrategy();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('dispose()', () => {
    it('unsubscribes from span lifecycle events', () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      // Access the private unsubscribe functions to verify they exist
      const privateClient = client as unknown as {
        _unsubscribeSpanStart: (() => void) | null;
        _unsubscribeSpanEnd: (() => void) | null;
      };

      expect(privateClient._unsubscribeSpanStart).not.toBeNull();
      expect(privateClient._unsubscribeSpanEnd).not.toBeNull();

      client.dispose();

      expect(privateClient._unsubscribeSpanStart).toBeNull();
      expect(privateClient._unsubscribeSpanEnd).toBeNull();
    });

    it('clears pending spans tracking', () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      const privateClient = client as unknown as {
        _pendingSpans: Set<string>;
        _spanCompletionPromise: Promise<void> | null;
        _resolveSpanCompletion: (() => void) | null;
      };

      // Add some pending spans
      privateClient._pendingSpans.add('span1');
      privateClient._pendingSpans.add('span2');
      privateClient._spanCompletionPromise = new Promise(() => {});
      privateClient._resolveSpanCompletion = () => {};

      expect(privateClient._pendingSpans.size).toBe(2);

      client.dispose();

      expect(privateClient._pendingSpans.size).toBe(0);
      expect(privateClient._spanCompletionPromise).toBeNull();
      expect(privateClient._resolveSpanCompletion).toBeNull();
    });

    it('clears flushLock reference', () => {
      const mockContext = {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      };
      const flushLock = makeFlushLock(mockContext as any);

      const client = new CloudflareClient({
        ...MOCK_CLIENT_OPTIONS,
        flushLock,
      });

      const privateClient = client as unknown as {
        _flushLock: ReturnType<typeof makeFlushLock> | void;
      };

      expect(privateClient._flushLock).toBeDefined();

      client.dispose();

      expect(privateClient._flushLock).toBeUndefined();
    });

    it('clears hooks', () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      // Add a hook
      const hookCallback = vi.fn();
      client.on('beforeEnvelope', hookCallback);

      const privateClient = client as unknown as {
        _hooks: Record<string, Set<unknown> | undefined>;
      };

      // Verify hook was registered - check that there are hooks with actual Sets
      const hooksWithSets = Object.values(privateClient._hooks).filter(v => v instanceof Set);
      expect(hooksWithSets.length).toBeGreaterThan(0);

      client.dispose();

      // All hooks should be cleared (set to undefined)
      const hooksWithSetsAfter = Object.values(privateClient._hooks).filter(v => v instanceof Set);
      expect(hooksWithSetsAfter.length).toBe(0);
    });

    it('clears event processors', () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      // Add an event processor
      client.addEventProcessor(event => event);

      const privateClient = client as unknown as {
        _eventProcessors: unknown[];
      };

      // SDK adds some default processors, so length should be >= 1
      const initialLength = privateClient._eventProcessors.length;
      expect(initialLength).toBeGreaterThan(0);

      client.dispose();

      expect(privateClient._eventProcessors.length).toBe(0);
    });

    it('clears integrations', () => {
      const mockIntegration = {
        name: 'MockIntegration',
        setupOnce: vi.fn(),
      };

      const client = new CloudflareClient({
        ...MOCK_CLIENT_OPTIONS,
        integrations: [mockIntegration],
      });

      // Need to call init() to setup integrations
      client.init();

      const privateClient = client as unknown as {
        _integrations: Record<string, unknown | undefined>;
      };

      // Integration should be registered
      expect(privateClient._integrations['MockIntegration']).toBeDefined();
      expect(privateClient._integrations['MockIntegration']).not.toBeUndefined();

      client.dispose();

      // Integration reference should be cleared (set to undefined)
      expect(privateClient._integrations['MockIntegration']).toBeUndefined();
    });

    it('clears transport reference', () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      const privateClient = client as unknown as {
        _transport?: unknown;
      };

      expect(privateClient._transport).toBeDefined();

      client.dispose();

      expect(privateClient._transport).toBeUndefined();
    });

    it('clears outcomes tracking', () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      const privateClient = client as unknown as {
        _outcomes: Record<string, number | undefined>;
      };

      // Add some outcomes
      privateClient._outcomes['reason:error:outcome1'] = 5;
      privateClient._outcomes['reason:error:outcome2'] = 10;

      // Verify we have actual values
      const validOutcomes = Object.values(privateClient._outcomes).filter(v => v !== undefined);
      expect(validOutcomes.length).toBe(2);

      client.dispose();

      // All outcomes should be set to undefined
      const validOutcomesAfter = Object.values(privateClient._outcomes).filter(v => v !== undefined);
      expect(validOutcomesAfter.length).toBe(0);
    });

    it('can be called multiple times safely', () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      // Should not throw when called multiple times
      expect(() => {
        client.dispose();
        client.dispose();
        client.dispose();
      }).not.toThrow();
    });

    it('does not break event emission after spanStart unsubscribe', () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      // Dispose which unsubscribes from span events
      client.dispose();

      // Should not throw when emitting span events after dispose
      expect(() => {
        client.emit('spanStart', {} as any);
        client.emit('spanEnd', {} as any);
      }).not.toThrow();
    });
  });

  describe('flush()', () => {
    it('calls transport flush with the given timeout', async () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      const privateClient = client as unknown as {
        _transport: { flush: ReturnType<typeof vi.fn> };
      };

      await client.flush(3000);

      expect(privateClient._transport.flush).toHaveBeenCalledWith(3000);
    });

    it('resolves with the transport flush result', async () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      const result = await client.flush(1000);

      expect(result).toBe(true);
    });

    it('waits for the flush lock before draining the transport', async () => {
      let releaseLock!: () => void;
      const finalize = vi.fn(() => new Promise<void>(resolve => (releaseLock = resolve)));
      const client = new CloudflareClient({
        ...MOCK_CLIENT_OPTIONS,
        flushLock: { ready: Promise.resolve(), finalize },
      });

      const privateClient = client as unknown as {
        _transport: { flush: ReturnType<typeof vi.fn> };
      };

      const flushPromise = client.flush(1000);

      // The transport must not drain while the lock is pending
      await Promise.resolve();
      expect(finalize).toHaveBeenCalled();
      expect(privateClient._transport.flush).not.toHaveBeenCalled();

      releaseLock();
      await flushPromise;
      expect(privateClient._transport.flush).toHaveBeenCalledWith(1000);
    });
  });

  describe('span lifecycle tracking', () => {
    it('tracks pending spans when spanStart is emitted', () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      const privateClient = client as unknown as {
        _pendingSpans: Set<string>;
        _spanCompletionPromise: Promise<void> | null;
      };

      expect(privateClient._pendingSpans.size).toBe(0);
      expect(privateClient._spanCompletionPromise).toBeNull();

      // Emit spanStart
      const mockSpan = {
        spanContext: () => ({ spanId: 'test-span-id', traceFlags: TRACE_FLAG_SAMPLED }),
      };
      client.emit('spanStart', mockSpan as any);

      expect(privateClient._pendingSpans.has('test-span-id')).toBe(true);
      expect(privateClient._spanCompletionPromise).not.toBeNull();
    });

    it('removes pending span when spanEnd is emitted', async () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      const privateClient = client as unknown as {
        _pendingSpans: Set<string>;
        _spanCompletionPromise: Promise<void> | null;
      };

      const mockSpan = {
        spanContext: () => ({ spanId: 'test-span-id', traceFlags: TRACE_FLAG_SAMPLED }),
      };

      // Start span
      client.emit('spanStart', mockSpan as any);
      expect(privateClient._pendingSpans.has('test-span-id')).toBe(true);

      // End span
      client.emit('spanEnd', mockSpan as any);
      expect(privateClient._pendingSpans.has('test-span-id')).toBe(false);
    });

    it('resolves completion promise when all spans end', async () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      const privateClient = client as unknown as {
        _pendingSpans: Set<string>;
        _spanCompletionPromise: Promise<void> | null;
      };

      const mockSpan1 = {
        spanContext: () => ({ spanId: 'span-1', traceFlags: TRACE_FLAG_SAMPLED }),
      };
      const mockSpan2 = {
        spanContext: () => ({ spanId: 'span-2', traceFlags: TRACE_FLAG_SAMPLED }),
      };

      // Start both spans
      client.emit('spanStart', mockSpan1 as any);
      client.emit('spanStart', mockSpan2 as any);

      const completionPromise = privateClient._spanCompletionPromise;
      expect(completionPromise).not.toBeNull();

      // End first span - promise should still exist
      client.emit('spanEnd', mockSpan1 as any);
      expect(privateClient._pendingSpans.size).toBe(1);

      // End second span - promise should be resolved and reset
      client.emit('spanEnd', mockSpan2 as any);
      expect(privateClient._pendingSpans.size).toBe(0);

      // The original promise should resolve
      await expect(completionPromise).resolves.toBeUndefined();
    });

    it('does not track negatively sampled spans', () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      const privateClient = client as unknown as {
        _pendingSpans: Set<string>;
        _spanCompletionPromise: Promise<void> | null;
      };

      const nonRecordingSpan = {
        spanContext: () => ({ spanId: 'non-recording-span-id', traceFlags: 0 }),
      };

      client.emit('spanStart', nonRecordingSpan as any);

      expect(privateClient._pendingSpans.has('non-recording-span-id')).toBe(false);
      expect(privateClient._spanCompletionPromise).toBeNull();
    });

    it('does not track spans after dispose', () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      client.dispose();

      const privateClient = client as unknown as {
        _pendingSpans: Set<string>;
      };

      const mockSpan = {
        spanContext: () => ({ spanId: 'test-span-id' }),
      };

      // Emit spanStart after dispose - should not be tracked
      client.emit('spanStart', mockSpan as any);
      expect(privateClient._pendingSpans.has('test-span-id')).toBe(false);
    });

    it('does not track spans when cacheClient is enabled', async () => {
      const client = new CloudflareClient({
        ...MOCK_CLIENT_OPTIONS,
        cacheClient: true,
      });

      const privateClient = client as unknown as {
        _pendingSpans: Set<string>;
        _unsubscribeSpanStart: (() => void) | null;
        _unsubscribeSpanEnd: (() => void) | null;
      };

      // Span tracking is disabled for cached clients — flush must not wait
      expect(privateClient._unsubscribeSpanStart).toBeNull();
      expect(privateClient._unsubscribeSpanEnd).toBeNull();

      const mockSpan = {
        spanContext: () => ({ spanId: 'test-span-id', traceFlags: TRACE_FLAG_SAMPLED }),
      };
      client.emit('spanStart', mockSpan as any);

      expect(privateClient._pendingSpans.size).toBe(0);
      await expect(client.flush(10)).resolves.toBe(true);
    });
  });

  describe('cached client eager envelope delivery', () => {
    function makeEagerFlushClient(
      flushMock: ReturnType<typeof vi.fn>,
      extra: Partial<CloudflareClientOptions> = {},
    ): CloudflareClient {
      const client = new CloudflareClient({
        ...MOCK_CLIENT_OPTIONS,
        cacheClient: true,
        transport: () => ({
          send: vi.fn().mockResolvedValue({}),
          flush: flushMock,
        }),
        ...extra,
      });
      client.init();
      return client;
    }

    function reachFlushPoint(): void {
      const state = getInvocationState();
      if (state) {
        state.flushPointReached = true;
      }
    }

    it('does not drain the transport for envelopes before the invocation flush point', () => {
      const flushMock = vi.fn().mockResolvedValue(true);
      const client = makeEagerFlushClient(flushMock);
      const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };

      withInvocationIsolationScope(() => {
        client.emit('afterEnvelope', {});
      }, ctx as never);

      expect(flushMock).not.toHaveBeenCalled();
      expect(ctx.waitUntil).not.toHaveBeenCalled();
    });

    it('drains the transport for envelopes past the flush point and registers it with the invocation waitUntil', () => {
      const flushMock = vi.fn().mockResolvedValue(true);
      const client = makeEagerFlushClient(flushMock);
      const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };

      withInvocationIsolationScope(() => {
        reachFlushPoint();
        client.emit('afterEnvelope', {});
      }, ctx as never);

      expect(flushMock).toHaveBeenCalledTimes(1);
      expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
      expect(ctx.waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    });

    it('drains the transport for envelopes outside any invocation', () => {
      const flushMock = vi.fn().mockResolvedValue(true);
      const client = makeEagerFlushClient(flushMock);

      client.emit('afterEnvelope', {});

      expect(flushMock).toHaveBeenCalledTimes(1);
    });

    it('does not register a waitUntil when no context is known', () => {
      const flushMock = vi.fn().mockResolvedValue(true);
      const client = makeEagerFlushClient(flushMock);

      expect(() => client.emit('afterEnvelope', {})).not.toThrow();
      expect(flushMock).toHaveBeenCalledTimes(1);
    });

    it('registers the drain with the capturing invocation, not the latest one', () => {
      const flushMock = vi.fn().mockResolvedValue(true);
      const ctxA = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };
      const ctxB = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };
      const client = makeEagerFlushClient(flushMock);

      // An envelope captured by invocation A must register its drain on A's
      // waitUntil, even when invocation B is the one that ran `init()` last.
      withInvocationIsolationScope(() => {
        reachFlushPoint();
        client.emit('afterEnvelope', {});
      }, ctxA as never);
      expect(ctxA.waitUntil).toHaveBeenCalledTimes(1);
      expect(ctxB.waitUntil).not.toHaveBeenCalled();

      withInvocationIsolationScope(() => {
        reachFlushPoint();
        client.emit('afterEnvelope', {});
      }, ctxB as never);
      expect(ctxB.waitUntil).toHaveBeenCalledTimes(1);
    });

    it('never lets a failing drain reject the waitUntil registration', async () => {
      let registered: Promise<unknown> | undefined;
      const waitUntil = vi.fn((promise: Promise<unknown>) => {
        registered = promise;
      });
      const ctx = { waitUntil, passThroughOnException: vi.fn() };
      const client = makeEagerFlushClient(vi.fn().mockRejectedValue(new Error('ingest down')));

      withInvocationIsolationScope(() => {
        reachFlushPoint();
        client.emit('afterEnvelope', {});
      }, ctx as never);

      expect(waitUntil).toHaveBeenCalledTimes(1);
      // The promise handed to the runtime must resolve: a rejected waitUntil
      // promise would mark the invocation's outcome as an exception.
      await expect(registered).resolves.toBeUndefined();
    });

    it('envelopes created by the boundary flush ride its drain; later ones start their own', async () => {
      const flushMock = vi.fn().mockResolvedValue(true);
      const client = new CloudflareClient({
        ...MOCK_CLIENT_OPTIONS,
        cacheClient: true,
        transport: () => ({ send: vi.fn().mockResolvedValue({}), flush: flushMock }),
      });
      const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };
      let envelopesDuringFlush = 0;
      // Hooks registered before the client's own (core log/metric drains, the span
      // buffer, which `init()` sets up) create envelopes on the same `flush` emit.
      client.on('flush', () => {
        client.emit('afterEnvelope', {});
        envelopesDuringFlush = flushMock.mock.calls.length;
      });
      client.init();

      await withInvocationIsolationScope(async () => {
        await client.flush(10);
        // No eager drain for that envelope: the flush point was not marked yet when it
        // was created, and the boundary flush's own transport drain follows.
        expect(envelopesDuringFlush).toBe(0);
        expect(flushMock).toHaveBeenCalledTimes(1);
        expect(ctx.waitUntil).not.toHaveBeenCalled();

        client.emit('afterEnvelope', {});
        expect(flushMock).toHaveBeenCalledTimes(2);
        expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
      }, ctx as never);
    });

    it('does not flush eagerly per envelope when cacheClient is disabled', () => {
      const flushMock = vi.fn().mockResolvedValue(true);
      const client = new CloudflareClient({
        ...MOCK_CLIENT_OPTIONS,
        cacheClient: false,
        transport: () => ({
          send: vi.fn().mockResolvedValue({}),
          flush: flushMock,
        }),
      });
      client.init();

      client.emit('afterEnvelope', {});
      expect(flushMock).not.toHaveBeenCalled();
    });
  });

  describe('cached client eager span delivery', () => {
    function makeCachedClient(): { client: CloudflareClient; flushSpy: ReturnType<typeof vi.fn> } {
      const client = new CloudflareClient({
        ...MOCK_CLIENT_OPTIONS,
        cacheClient: true,
        traceLifecycle: 'stream',
      } as never);
      client.init();
      const flushSpy = vi.fn();
      client.on('flushTraceSpans', flushSpy);
      return { client, flushSpy };
    }

    // The handler only reads the span's trace id — it is forwarded to the flushTraceSpans hook.
    function makeSpan(traceId: string) {
      return { spanContext: () => ({ traceId }) };
    }

    const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
    const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };

    it('does not flush spans ending before the invocation flush point', async () => {
      const { client, flushSpy } = makeCachedClient();

      await withInvocationIsolationScope(async () => {
        client.emit('afterSpanEnd', makeSpan('trace-b') as never);
        await tick();
      }, ctx as never);

      expect(flushSpy).not.toHaveBeenCalled();
    });

    it('flushes the trace of a span ending after the invocation flush point', async () => {
      const { client, flushSpy } = makeCachedClient();

      await withInvocationIsolationScope(async () => {
        await client.flush(0);
        client.emit('afterSpanEnd', makeSpan('trace-1') as never);
        await tick();
      }, ctx as never);

      expect(flushSpy).toHaveBeenCalledTimes(1);
      expect(flushSpy).toHaveBeenCalledWith('trace-1');
    });

    it('does not flush spans of an invocation whose flush point has not been reached', async () => {
      const { client, flushSpy } = makeCachedClient();

      // Invocation A passes its flush point …
      await withInvocationIsolationScope(async () => {
        await client.flush(0);
      }, ctx as never);

      // … while invocation B is still in flight — its spans keep batching
      const ctxB = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };
      await withInvocationIsolationScope(async () => {
        client.emit('afterSpanEnd', makeSpan('trace-1') as never);
        await tick();
      }, ctxB as never);

      expect(flushSpy).not.toHaveBeenCalled();
    });

    it('schedules a flush per invocation when concurrent invocations are past their flush point', async () => {
      const { client, flushSpy } = makeCachedClient();

      const ctxA = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };
      const ctxB = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };

      // Both invocations end a span past their flush point in the same tick — each
      // must schedule its own flush in its own async context, so the listener
      // derives the right trace (and waitUntil) per invocation.
      await Promise.all([
        withInvocationIsolationScope(async () => {
          await client.flush(0);
          client.emit('afterSpanEnd', makeSpan('trace-a') as never);
        }, ctxA as never),
        withInvocationIsolationScope(async () => {
          await client.flush(0);
          client.emit('afterSpanEnd', makeSpan('trace-b') as never);
        }, ctxB as never),
      ]);
      await tick();

      expect(flushSpy).toHaveBeenCalledTimes(2);
      expect(flushSpy).toHaveBeenCalledWith('trace-a');
      expect(flushSpy).toHaveBeenCalledWith('trace-b');
    });

    it('flushes every trace when one invocation ends spans of several traces in the same turn', async () => {
      const { client, flushSpy } = makeCachedClient();

      // A single invocation can own more than one trace past its flush point —
      // e.g. two `startNewTrace` background jobs completing synchronously inside
      // one `ctx.waitUntil`. Debouncing per invocation instead of per trace would
      // schedule only the first trace and leave the rest buffered with no later
      // in-invocation drain.
      await withInvocationIsolationScope(async () => {
        await client.flush(0);
        client.emit('afterSpanEnd', makeSpan('trace-a') as never);
        client.emit('afterSpanEnd', makeSpan('trace-b') as never);
        await tick();
      }, ctx as never);

      expect(flushSpy).toHaveBeenCalledTimes(2);
      expect(flushSpy).toHaveBeenCalledWith('trace-a');
      expect(flushSpy).toHaveBeenCalledWith('trace-b');
    });

    it('flushes each span end of the same trace on its own', async () => {
      // No per-turn coalescing: draining only the ended span's trace bucket is cheap, and
      // deferring it bought no measurable CPU in production.
      const { client, flushSpy } = makeCachedClient();

      await withInvocationIsolationScope(async () => {
        await client.flush(0);
        client.emit('afterSpanEnd', makeSpan('trace-a') as never);
        client.emit('afterSpanEnd', makeSpan('trace-a') as never);
      }, ctx as never);

      expect(flushSpy).toHaveBeenCalledTimes(2);
      expect(flushSpy).toHaveBeenCalledWith('trace-a');
    });

    it("flushes each invocation's trace in its own async context", async () => {
      const { client } = makeCachedClient();
      const ctxA = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };
      const ctxB = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };
      const flushContext = new Map<string, unknown>();

      client.on('flushTraceSpans', traceId => {
        flushContext.set(String(traceId), getInvocationState()?.ctx);
      });

      await Promise.all([
        withInvocationIsolationScope(async () => {
          await client.flush(0);
          client.emit('afterSpanEnd', makeSpan('trace-a') as never);
        }, ctxA as never),
        withInvocationIsolationScope(async () => {
          await client.flush(0);
          client.emit('afterSpanEnd', makeSpan('trace-b') as never);
        }, ctxB as never),
      ]);
      await tick();

      expect(flushContext.get('trace-a')).toBe(ctxA);
      expect(flushContext.get('trace-b')).toBe(ctxB);
    });

    it('delivers spans of detached continuations eagerly once the owning invocation flushed', async () => {
      const { client, flushSpy } = makeCachedClient();

      let releaseDetached!: () => void;
      const detachedGate = new Promise<void>(resolve => {
        releaseDetached = resolve;
      });
      // A detached continuation is created inside the invocation but settles after it
      const continuation = withInvocationIsolationScope(async () => {
        await client.flush(0);
        return (async () => {
          await detachedGate;
          client.emit('afterSpanEnd', makeSpan('trace-1') as never);
        })();
      }, ctx as never);

      releaseDetached();
      await continuation;
      await tick();

      expect(flushSpy).toHaveBeenCalledTimes(1);
      expect(flushSpy).toHaveBeenCalledWith('trace-1');
    });

    it('flushes spans ending outside any invocation eagerly', async () => {
      const { client, flushSpy } = makeCachedClient();

      // No boundary flush will ever come for them, and the buffer's own timer
      // would fire where the runtime suspends the send.
      client.emit('afterSpanEnd', makeSpan('trace-1') as never);
      client.emit('afterSpanEnd', makeSpan('trace-1') as never);

      expect(flushSpy).toHaveBeenCalledTimes(2);
      expect(flushSpy).toHaveBeenCalledWith('trace-1');
    });

    it('does not flush for span ends when cacheClient is disabled', async () => {
      const client = new CloudflareClient({
        ...MOCK_CLIENT_OPTIONS,
        cacheClient: false,
        traceLifecycle: 'stream',
      } as never);
      const flushSpy = vi.fn();
      client.on('flushTraceSpans', flushSpy);

      await withInvocationIsolationScope(async () => {
        await client.flush(0);
        client.emit('afterSpanEnd', makeSpan('trace-1') as never);
        await tick();
      }, ctx as never);

      expect(flushSpy).not.toHaveBeenCalled();
    });
  });
});
