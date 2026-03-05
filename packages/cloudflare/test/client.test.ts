import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAsyncLocalStorageAsyncContextStrategy } from '../src/async';
import { CloudflareClient, type CloudflareClientOptions } from '../src/client';
import { makeFlushLock } from '../src/flush';

const MOCK_CLIENT_OPTIONS: CloudflareClientOptions = {
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  stackParser: () => [],
  integrations: [],
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
        spanContext: () => ({ spanId: 'test-span-id' }),
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
        spanContext: () => ({ spanId: 'test-span-id' }),
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

      const mockSpan1 = { spanContext: () => ({ spanId: 'span-1' }) };
      const mockSpan2 = { spanContext: () => ({ spanId: 'span-2' }) };

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
  });
});
