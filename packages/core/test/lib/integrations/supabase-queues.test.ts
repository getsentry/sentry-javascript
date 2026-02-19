import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '../../../src';
import * as CurrentScopes from '../../../src/currentScopes';
import * as exports from '../../../src/exports';
import type { SupabaseClientInstance, SupabaseResponse } from '../../../src/integrations/supabase';
import { instrumentSupabaseClient } from '../../../src/integrations/supabase';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../../src/semanticAttributes';
import * as Tracing from '../../../src/tracing';
import { startSpan } from '../../../src/tracing';

const SUCCESS_RESPONSE: SupabaseResponse = { data: [{ msg_id: 123 }], status: 200 };
const BATCH_RESPONSE: SupabaseResponse = { data: [{ msg_id: 1 }, { msg_id: 2 }, { msg_id: 3 }], status: 200 };
const ERROR_RESPONSE: SupabaseResponse = { data: [], error: { message: 'Queue error', code: 'ERR' } };
const EMPTY_RESPONSE: SupabaseResponse = { data: [], status: 200 };
const NULL_RESPONSE: SupabaseResponse = { data: null, status: 200 };

/** Helper to find a startSpan call by queue operation type. */
function findSpanCall(
  spy: ReturnType<typeof vi.spyOn>,
  opType: 'queue.publish' | 'queue.process',
): [Record<string, unknown>, ...unknown[]] | undefined {
  return (spy.mock.calls as Array<[Record<string, unknown>, ...unknown[]]>).find(
    (call: [Record<string, unknown>, ...unknown[]]) =>
      (call[0]?.attributes as Record<string, unknown> | undefined)?.['sentry.op'] === opType,
  );
}

/** Helper to set up mock, instrument, and call an RPC operation. */
async function callRpc(
  mockRpcFunction: ReturnType<typeof vi.fn>,
  mockSupabaseClient: SupabaseClientInstance,
  operation: string,
  params: Record<string, unknown>,
  mockResponse: SupabaseResponse | Error,
): Promise<unknown> {
  if (mockResponse instanceof Error) {
    mockRpcFunction.mockRejectedValue(mockResponse);
  } else {
    mockRpcFunction.mockResolvedValue(mockResponse);
  }
  instrumentSupabaseClient(mockSupabaseClient);

  return startSpan({ name: 'test-transaction' }, () => mockSupabaseClient.rpc(operation, params));
}

describe('Supabase Queue Instrumentation', () => {
  let mockClient: Client;
  let mockRpcFunction: ReturnType<typeof vi.fn>;
  let mockSupabaseClient: SupabaseClientInstance;

  beforeEach(() => {
    mockClient = {
      getOptions: () => ({
        normalizeDepth: 3,
        normalizeMaxBreadth: 1000,
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      }),
      getDsn: () => ({
        protocol: 'https',
        publicKey: 'public',
        pass: '',
        host: 'dsn.ingest.sentry.io',
        port: '',
        path: '',
        projectId: '1337',
      }),
      getIntegrationByName: () => undefined,
      on: vi.fn(),
      emit: vi.fn(),
      getTransport: () => ({ send: vi.fn() }),
    } as unknown as Client;

    vi.spyOn(CurrentScopes, 'getClient').mockImplementation(() => mockClient);

    mockRpcFunction = vi.fn();

    function MockSupabaseClient() {}
    MockSupabaseClient.prototype = {
      from: vi.fn(),
      schema: vi.fn(),
      rpc: mockRpcFunction,
    };

    mockSupabaseClient = Object.create(MockSupabaseClient.prototype) as SupabaseClientInstance;
    (mockSupabaseClient as any).constructor = MockSupabaseClient;
    (mockSupabaseClient as any).auth = {
      signInWithPassword: vi.fn(),
      admin: { createUser: vi.fn() },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Producer', () => {
    it('should create queue.publish span with trace injection', async () => {
      await callRpc(
        mockRpcFunction,
        mockSupabaseClient,
        'send',
        { queue_name: 'test-queue', message: { foo: 'bar' } },
        SUCCESS_RESPONSE,
      );

      expect(mockRpcFunction).toHaveBeenCalledWith('send', {
        queue_name: 'test-queue',
        message: expect.objectContaining({
          foo: 'bar',
          _sentry: expect.objectContaining({
            sentry_trace: expect.any(String),
            baggage: expect.any(String),
          }),
        }),
      });

      const call = mockRpcFunction.mock.calls[0];
      expect(call[1].message._sentry).toEqual({
        sentry_trace: expect.any(String),
        baggage: expect.any(String),
      });
    });

    it('should create queue.publish span for batch send', async () => {
      await callRpc(
        mockRpcFunction,
        mockSupabaseClient,
        'send_batch',
        { queue_name: 'test-queue', messages: [{ foo: 'bar' }, { baz: 'qux' }] },
        BATCH_RESPONSE,
      );

      expect(mockRpcFunction).toHaveBeenCalledWith('send_batch', {
        queue_name: 'test-queue',
        messages: expect.arrayContaining([
          expect.objectContaining({
            foo: 'bar',
            _sentry: expect.objectContaining({ sentry_trace: expect.any(String), baggage: expect.any(String) }),
          }),
          expect.objectContaining({
            baz: 'qux',
            _sentry: expect.objectContaining({ sentry_trace: expect.any(String), baggage: expect.any(String) }),
          }),
        ]),
      });
    });

    it('should handle producer rejection error', async () => {
      await expect(
        callRpc(
          mockRpcFunction,
          mockSupabaseClient,
          'send',
          { queue_name: 'test-queue', message: { foo: 'bar' } },
          new Error('Queue send failed'),
        ),
      ).rejects.toThrow('Queue send failed');
    });

    it('should capture producer errors with producer mechanism type', async () => {
      const captureExceptionSpy = vi.spyOn(exports, 'captureException').mockImplementation(() => '');

      await callRpc(
        mockRpcFunction,
        mockSupabaseClient,
        'send',
        { queue_name: 'test-queue', message: { foo: 'bar' } },
        ERROR_RESPONSE,
      );

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);

      // Execute the scope callback to verify mechanism type
      const scopeCallback = captureExceptionSpy.mock.calls[0]![1] as (scope: any) => any;
      const mockScope = { addEventProcessor: vi.fn().mockReturnThis(), setContext: vi.fn().mockReturnThis() };
      scopeCallback(mockScope);

      const eventProcessor = mockScope.addEventProcessor.mock.calls[0]![0];
      const event = { exception: { values: [{}] } };
      eventProcessor(event);

      expect(event.exception.values[0]).toEqual(
        expect.objectContaining({
          mechanism: expect.objectContaining({ type: 'auto.db.supabase.queue.producer' }),
        }),
      );

      captureExceptionSpy.mockRestore();
    });

    it('should not mutate original params for single send or batch send', async () => {
      const singleParams = { queue_name: 'test-queue', message: { foo: 'bar', nested: { value: 42 } } };
      const batchParams = { queue_name: 'test-queue', messages: [{ foo: 'bar' }, { baz: 'qux' }] };

      const singleCopy = JSON.stringify(singleParams.message);
      const batchCopy = JSON.stringify(batchParams.messages);

      mockRpcFunction.mockResolvedValue(SUCCESS_RESPONSE);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', singleParams);
      });

      expect(JSON.stringify(singleParams.message)).toBe(singleCopy);
      expect(singleParams.message).not.toHaveProperty('_sentry');

      // Reset mock for batch call
      mockRpcFunction.mockResolvedValue({ data: [{ msg_id: 1 }, { msg_id: 2 }], status: 200 });

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send_batch', batchParams);
      });

      expect(JSON.stringify(batchParams.messages)).toBe(batchCopy);
      expect(batchParams.messages[0]).not.toHaveProperty('_sentry');
      expect(batchParams.messages[1]).not.toHaveProperty('_sentry');
    });

    it('should set correct span attributes on producer span', async () => {
      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await callRpc(
        mockRpcFunction,
        mockSupabaseClient,
        'send',
        { queue_name: 'attr-test-queue', message: { test: 'data' } },
        SUCCESS_RESPONSE,
      );

      const publishSpanCall = (startSpanSpy.mock.calls as Array<[Record<string, unknown>]>).find(
        call => call[0]?.name === 'publish attr-test-queue',
      );
      expect(publishSpanCall).toBeDefined();
      expect(publishSpanCall?.[0]).toEqual(
        expect.objectContaining({
          name: 'publish attr-test-queue',
          attributes: expect.objectContaining({
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.supabase.queue.producer',
            'sentry.op': 'queue.publish',
            'sentry.source': 'task',
            'messaging.system': 'supabase',
            'messaging.destination.name': 'attr-test-queue',
            'messaging.operation.name': 'send',
            'messaging.operation.type': 'publish',
            'messaging.message.body.size': expect.any(Number),
          }),
        }),
      );
    });
  });

  describe('Consumer', () => {
    it('should create queue.process span and clean _sentry metadata', async () => {
      const consumerResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 123,
            message: {
              foo: 'bar',
              _sentry: {
                sentry_trace: '12345678901234567890123456789012-1234567890123456-1',
                baggage: 'sentry-environment=production',
              },
            },
            enqueued_at: new Date().toISOString(),
          },
        ],
        status: 200,
      };

      const result = (await callRpc(
        mockRpcFunction,
        mockSupabaseClient,
        'pop',
        { queue_name: 'test-queue' },
        consumerResponse,
      )) as SupabaseResponse;

      expect(result.data?.[0]?.message).toEqual({ foo: 'bar' });
      expect(result.data?.[0]?.message).not.toHaveProperty('_sentry');

      expect(mockRpcFunction).toHaveBeenCalledWith('pop', { queue_name: 'test-queue' });
    });

    it('should create consumer span with span link when trace context is present', async () => {
      const producerTraceId = 'a'.repeat(32);
      const producerSpanId = 'b'.repeat(16);
      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await callRpc(
        mockRpcFunction,
        mockSupabaseClient,
        'pop',
        { queue_name: 'test-queue' },
        {
          data: [
            {
              msg_id: 123,
              message: {
                foo: 'bar',
                _sentry: {
                  sentry_trace: `${producerTraceId}-${producerSpanId}-1`,
                  baggage: 'sentry-environment=production',
                },
              },
            },
          ],
          status: 200,
        },
      );

      const consumerSpanCall = findSpanCall(startSpanSpy, 'queue.process');
      expect(consumerSpanCall).toBeDefined();
      expect(consumerSpanCall?.[0]?.name).toBe('process test-queue');
      expect((consumerSpanCall?.[0]?.attributes as Record<string, unknown>)?.['sentry.op']).toBe('queue.process');
    });

    it.each([
      ['empty data array', EMPTY_RESPONSE],
      ['null data', NULL_RESPONSE],
    ])('should create consumer span for %s response', async (_label, response) => {
      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      const result = await callRpc(mockRpcFunction, mockSupabaseClient, 'pop', { queue_name: 'empty-queue' }, response);

      expect(result).toEqual(response);
      const processSpanCall = findSpanCall(startSpanSpy, 'queue.process');
      expect(processSpanCall).toBeDefined();
      expect(processSpanCall?.[0]?.name).toBe('process empty-queue');
    });

    it('should create consumer span on error response', async () => {
      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await callRpc(mockRpcFunction, mockSupabaseClient, 'pop', { queue_name: 'test-queue' }, ERROR_RESPONSE);

      const processSpanCall = findSpanCall(startSpanSpy, 'queue.process');
      expect(processSpanCall).toBeDefined();
      expect(processSpanCall?.[0]?.name).toBe('process test-queue');
    });

    it('should capture consumer errors with consumer mechanism type', async () => {
      const captureExceptionSpy = vi.spyOn(exports, 'captureException').mockImplementation(() => '');

      await callRpc(mockRpcFunction, mockSupabaseClient, 'pop', { queue_name: 'test-queue' }, ERROR_RESPONSE);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);

      const scopeCallback = captureExceptionSpy.mock.calls[0]![1] as (scope: any) => any;
      const mockScope = { addEventProcessor: vi.fn().mockReturnThis(), setContext: vi.fn().mockReturnThis() };
      scopeCallback(mockScope);

      const eventProcessor = mockScope.addEventProcessor.mock.calls[0]![0];
      const event = { exception: { values: [{}] } };
      eventProcessor(event);

      expect(event.exception.values[0]).toEqual(
        expect.objectContaining({
          mechanism: expect.objectContaining({ type: 'auto.db.supabase.queue.consumer' }),
        }),
      );

      captureExceptionSpy.mockRestore();
    });

    it('should set correct attributes on consumer span', async () => {
      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await callRpc(
        mockRpcFunction,
        mockSupabaseClient,
        'pop',
        { queue_name: 'consumer-attr-queue' },
        { data: [{ msg_id: 999, message: { data: 'test' }, enqueued_at: new Date().toISOString() }], status: 200 },
      );

      const processSpanCall = (startSpanSpy.mock.calls as Array<[Record<string, unknown>]>).find(
        call => call[0]?.name === 'process consumer-attr-queue',
      );
      expect(processSpanCall).toBeDefined();
      expect(processSpanCall?.[0]).toEqual(
        expect.objectContaining({
          name: 'process consumer-attr-queue',
          attributes: expect.objectContaining({
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.supabase.queue.consumer',
            'sentry.op': 'queue.process',
            'sentry.source': 'task',
            'messaging.system': 'supabase',
            'messaging.destination.name': 'consumer-attr-queue',
          }),
        }),
      );
    });
  });

  describe('Schema-Qualified Names', () => {
    it('should instrument schema-qualified producer calls', async () => {
      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await callRpc(
        mockRpcFunction,
        mockSupabaseClient,
        'pgmq.send',
        { queue_name: 'test-queue', message: { foo: 'bar' } },
        SUCCESS_RESPONSE,
      );

      const spanCall = findSpanCall(startSpanSpy, 'queue.publish');
      expect(spanCall).toBeDefined();
      expect(spanCall?.[0]?.name).toBe('publish test-queue');
      expect((spanCall?.[0]?.attributes as Record<string, unknown>)?.['messaging.operation.name']).toBe('send');
    });

    it('should instrument schema-qualified consumer calls', async () => {
      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await callRpc(
        mockRpcFunction,
        mockSupabaseClient,
        'pgmq.pop',
        { queue_name: 'test-queue', vt: 30, qty: 1 },
        { data: [{ msg_id: 123, message: { foo: 'bar' } }], status: 200 },
      );

      const processSpanCall = findSpanCall(startSpanSpy, 'queue.process');
      expect(processSpanCall).toBeDefined();
      expect((processSpanCall?.[0]?.attributes as Record<string, unknown>)?.['messaging.operation.name']).toBe('pop');
    });
  });

  describe('Payload integrity', () => {
    it.each([
      [123, 'number'],
      ['hello world', 'string'],
      [[1, 2, 3], 'array'],
    ])('should not corrupt primitive/non-object payload: %p (%s)', async (payload, _label) => {
      await callRpc(
        mockRpcFunction,
        mockSupabaseClient,
        'send',
        { queue_name: 'primitive-queue', message: payload },
        SUCCESS_RESPONSE,
      );

      const call = mockRpcFunction.mock.calls[0];
      if (Array.isArray(payload)) {
        expect(call[1].message).toEqual(payload);
        expect(Array.isArray(call[1].message)).toBe(true);
      } else {
        expect(call[1].message).toBe(payload);
      }
    });

    it('should not corrupt batch with mixed payload types', async () => {
      await callRpc(
        mockRpcFunction,
        mockSupabaseClient,
        'send_batch',
        { queue_name: 'mixed-batch', messages: [123, 'hello', { foo: 'bar' }] },
        BATCH_RESPONSE,
      );

      const call = mockRpcFunction.mock.calls[0];
      expect(call[1].messages[0]).toBe(123);
      expect(call[1].messages[1]).toBe('hello');
      expect(call[1].messages[2]).toEqual({
        foo: 'bar',
        _sentry: expect.objectContaining({
          sentry_trace: expect.any(String),
          baggage: expect.any(String),
        }),
      });
    });
  });

  describe('Edge cases', () => {
    it('should not double-wrap rpc method when instrumentSupabaseClient is called multiple times', async () => {
      mockRpcFunction.mockResolvedValue(SUCCESS_RESPONSE);

      instrumentSupabaseClient(mockSupabaseClient);
      instrumentSupabaseClient(mockSupabaseClient);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', { queue_name: 'test-queue', message: { foo: 'bar' } });
      });

      const publishSpanCalls = (startSpanSpy.mock.calls as Array<[Record<string, unknown>]>).filter(
        call => (call[0]?.attributes as Record<string, unknown> | undefined)?.['sentry.op'] === 'queue.publish',
      );
      expect(publishSpanCalls.length).toBe(1);
    });

    it('should not instrument non-queue RPC calls as queue operations', async () => {
      const mockResponse = { data: { result: 'success' } };

      const result = await callRpc(
        mockRpcFunction,
        mockSupabaseClient,
        'custom_function',
        { param: 'value' },
        mockResponse as unknown as SupabaseResponse,
      );

      expect(result).toEqual(mockResponse);
      expect(mockRpcFunction).toHaveBeenCalledWith('custom_function', { param: 'value' });
    });

    it('should fall back to generic RPC instrumentation for queue-named functions without queue_name', async () => {
      const mockResponse = { data: { result: 'ok' }, status: 200 };
      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      const result = await startSpan({ name: 'test-transaction' }, async () => {
        return mockSupabaseClient.rpc('send', { some_param: 'value' });
      });

      expect(result).toEqual(mockResponse);

      // Should NOT create a queue.publish span
      const publishCalls = findSpanCall(startSpanSpy, 'queue.publish');
      expect(publishCalls).toBeUndefined();

      // Should create a generic db span via _instrumentGenericRpc
      const genericCall = (startSpanSpy.mock.calls as Array<[Record<string, unknown>]>).find(
        call => (call[0]?.attributes as Record<string, unknown> | undefined)?.['sentry.op'] === 'db',
      );
      expect(genericCall).toBeDefined();
      expect((genericCall as [Record<string, unknown>])[0].name).toBe('rpc(send)');
    });
  });

  describe('RPC method chaining', () => {
    function createMockBuilder() {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi
          .fn()
          .mockImplementation(
            (onfulfilled?: (...args: unknown[]) => unknown, onrejected?: (...args: unknown[]) => unknown) => {
              return Promise.resolve({ data: { result: 'ok' }, status: 200 }).then(
                onfulfilled as any,
                onrejected as any,
              );
            },
          ),
      };
    }

    it('should preserve method chaining on the builder returned by rpc()', () => {
      const mockBuilder = createMockBuilder();

      mockRpcFunction.mockReturnValue(mockBuilder);
      instrumentSupabaseClient(mockSupabaseClient);

      const result = mockSupabaseClient.rpc('get_planets', {});

      expect(typeof (result as any).select).toBe('function');
      (result as any).select('id, name');
      expect(mockBuilder.select).toHaveBeenCalledWith('id, name');
    });

    it('should still create a span when rpc() result is awaited', async () => {
      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');
      const mockBuilder = createMockBuilder();

      mockRpcFunction.mockReturnValue(mockBuilder);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('get_planets', {});
      });

      const genericCall = (startSpanSpy.mock.calls as Array<[Record<string, unknown>]>).find(
        call => call[0]?.name === 'rpc(get_planets)',
      );
      expect(genericCall).toBeDefined();
      expect((genericCall as [Record<string, unknown>])[0]).toEqual(
        expect.objectContaining({
          name: 'rpc(get_planets)',
          attributes: expect.objectContaining({
            'db.system': 'postgresql',
            'sentry.op': 'db',
          }),
        }),
      );
    });

    it('should preserve chaining when queue RPC falls back to generic instrumentation', () => {
      // rpc('send', { some_param: 'value' }) - no queue_name, falls back to generic
      const mockBuilder = createMockBuilder();

      mockRpcFunction.mockReturnValue(mockBuilder);
      instrumentSupabaseClient(mockSupabaseClient);

      const result = mockSupabaseClient.rpc('send', { some_param: 'value' });
      expect(typeof (result as any).select).toBe('function');
    });
  });

  describe('Trace Propagation', () => {
    it('should propagate trace from producer to consumer end-to-end', async () => {
      let capturedTraceContext: { sentry_trace?: string; baggage?: string } | undefined;

      mockRpcFunction.mockImplementation(async (operation: string, params: any) => {
        if (operation === 'send') {
          capturedTraceContext = params.message._sentry;
          return { data: [{ msg_id: 123 }], status: 200 };
        }
        return {
          data: [{ msg_id: 123, message: { foo: 'bar', _sentry: capturedTraceContext } }],
          status: 200,
        };
      });

      instrumentSupabaseClient(mockSupabaseClient);

      // Producer
      await startSpan({ name: 'producer-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', { queue_name: 'test-queue', message: { foo: 'bar' } });
      });

      expect(capturedTraceContext).toBeDefined();
      expect(capturedTraceContext?.sentry_trace).toBeTruthy();
      expect(capturedTraceContext?.baggage).toBeTruthy();

      // Consumer
      await startSpan({ name: 'consumer-transaction' }, async () => {
        const result = (await mockSupabaseClient.rpc('pop', { queue_name: 'test-queue' })) as SupabaseResponse;
        expect(result.data?.[0]?.message).not.toHaveProperty('_sentry');
      });
    });
  });
});
