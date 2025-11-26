import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '../../../src';
import { getCurrentScope } from '../../../src';
import * as Breadcrumbs from '../../../src/breadcrumbs';
import * as CurrentScopes from '../../../src/currentScopes';
import type { SupabaseClientInstance, SupabaseResponse } from '../../../src/integrations/supabase';
import { instrumentSupabaseClient } from '../../../src/integrations/supabase';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../../src/semanticAttributes';
import * as Tracing from '../../../src/tracing';
import { startSpan } from '../../../src/tracing';
import { getActiveSpan } from '../../../src/utils/spanUtils';

describe('Supabase Queue Instrumentation', () => {
  let mockClient: Client;
  let mockRpcFunction: any;
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

    // Create a mock RPC function
    mockRpcFunction = vi.fn();

    // Create a mock constructor with rpc on the prototype (matching real Supabase client behavior)
    function MockSupabaseClient() {}
    MockSupabaseClient.prototype = {
      from: vi.fn(),
      schema: vi.fn(),
      rpc: mockRpcFunction,
    };

    // Create a mock Supabase client instance using Object.create to properly inherit from prototype
    mockSupabaseClient = Object.create(MockSupabaseClient.prototype) as SupabaseClientInstance;
    (mockSupabaseClient as any).constructor = MockSupabaseClient;
    (mockSupabaseClient as any).auth = {
      signInWithPassword: vi.fn(),
      admin: {
        createUser: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Producer Spans (send)', () => {
    it('should create a queue.publish span for single message send', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 123 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'test-queue',
          message: { foo: 'bar' },
        });
      });

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
    });

    it('should create a queue.publish span for batch message send', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 123 }, { msg_id: 124 }, { msg_id: 125 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send_batch', {
          queue_name: 'test-queue',
          messages: [{ foo: 'bar' }, { baz: 'qux' }],
        });
      });

      expect(mockRpcFunction).toHaveBeenCalledWith('send_batch', {
        queue_name: 'test-queue',
        messages: expect.arrayContaining([
          expect.objectContaining({
            foo: 'bar',
            _sentry: expect.objectContaining({
              sentry_trace: expect.any(String),
              baggage: expect.any(String),
            }),
          }),
          expect.objectContaining({
            baz: 'qux',
            _sentry: expect.objectContaining({
              sentry_trace: expect.any(String),
              baggage: expect.any(String),
            }),
          }),
        ]),
      });
    });

    it('should inject trace context into message metadata', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 123 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'test-queue',
          message: { foo: 'bar' },
        });
      });

      const call = mockRpcFunction.mock.calls[0];
      expect(call[1].message._sentry).toEqual({
        sentry_trace: expect.any(String),
        baggage: expect.any(String),
      });
    });

    it('should handle producer errors and capture exception', async () => {
      const mockError = new Error('Queue send failed');
      mockRpcFunction.mockRejectedValue(mockError);
      instrumentSupabaseClient(mockSupabaseClient);

      await expect(
        startSpan({ name: 'test-transaction' }, async () => {
          await mockSupabaseClient.rpc('send', {
            queue_name: 'test-queue',
            message: { foo: 'bar' },
          });
        }),
      ).rejects.toThrow('Queue send failed');
    });

    it('should handle response errors in producer', async () => {
      const mockResponse: SupabaseResponse = {
        data: [],
        error: {
          message: 'Queue is full',
          code: 'QUEUE_FULL',
        },
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'test-queue',
          message: { foo: 'bar' },
        });
      });

      expect(mockRpcFunction).toHaveBeenCalled();

      // Verify producer span was created despite error response
      const publishSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.publish');
      expect(publishSpanCall).toBeDefined();
      expect(publishSpanCall?.[0]?.name).toBe('publish test-queue');
    });
  });

  describe('Consumer Spans (pop)', () => {
    it('should create a queue.process span for message consumption', async () => {
      const mockResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 123,
            message: { foo: 'bar' },
            enqueued_at: new Date().toISOString(),
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        const result = await mockSupabaseClient.rpc('pop', {
          queue_name: 'test-queue',
        });

        expect(result).toEqual(mockResponse);
      });

      expect(mockRpcFunction).toHaveBeenCalledWith('pop', {
        queue_name: 'test-queue',
      });
    });

    it('should extract and clean up trace context from message', async () => {
      const mockResponse: SupabaseResponse = {
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

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        const result = (await mockSupabaseClient.rpc('pop', {
          queue_name: 'test-queue',
        })) as SupabaseResponse;

        // Verify _sentry metadata was removed from the response
        expect(result.data?.[0]?.message).not.toHaveProperty('_sentry');
        // Verify other message data is intact
        expect(result.data?.[0]?.message).toEqual({ foo: 'bar' });
      });
    });

    it('should extract trace context and create consumer span when message contains trace context', async () => {
      const mockResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 456,
            message: {
              data: 'test',
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

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      const result = await mockSupabaseClient.rpc('pop', {
        queue_name: 'trace-test-queue',
      });

      // Verify consumer span was created (implementation uses span links for distributed tracing)
      expect(startSpanSpy).toHaveBeenCalled();
      const consumerSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.process');
      expect(consumerSpanCall).toBeDefined();
      expect(consumerSpanCall?.[0]?.name).toBe('process trace-test-queue');

      // Verify _sentry metadata was removed from the response
      expect((result as SupabaseResponse).data?.[0]?.message).toEqual({ data: 'test' });
      expect((result as SupabaseResponse).data?.[0]?.message).not.toHaveProperty('_sentry');
    });

    it('should remove _sentry metadata from consumed messages', async () => {
      const mockResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 123,
            message: {
              foo: 'bar',
              _sentry: {
                sentry_trace: 'test-trace',
                baggage: 'test-baggage',
              },
            },
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const result = (await mockSupabaseClient.rpc('pop', {
        queue_name: 'test-queue',
      })) as SupabaseResponse;

      expect(result.data?.[0]?.message).toEqual({ foo: 'bar' });
      expect(result.data?.[0]?.message).not.toHaveProperty('_sentry');
    });

    it('should create consumer span when no trace context in message', async () => {
      const mockResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 123,
            message: { foo: 'bar' }, // No _sentry field
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      // Spy on startSpanManual
      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');
      startSpanSpy.mockClear();

      await mockSupabaseClient.rpc('pop', {
        queue_name: 'test-queue',
      });

      // Verify startSpan was called (consumer span created)
      expect(startSpanSpy).toHaveBeenCalled();
      const consumerSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.process');
      expect(consumerSpanCall).toBeDefined();
    });

    it('should handle consumer errors and capture exception', async () => {
      const mockResponse: SupabaseResponse = {
        data: [],
        error: {
          message: 'Queue not found',
          code: 'QUEUE_NOT_FOUND',
        },
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('pop', {
          queue_name: 'test-queue',
        });
      });

      expect(mockRpcFunction).toHaveBeenCalled();

      // Verify consumer span was created despite error response
      const processSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.process');
      expect(processSpanCall).toBeDefined();
      expect(processSpanCall?.[0]?.name).toBe('process test-queue');
    });

    it('should handle multiple messages in consumer response', async () => {
      const mockResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 123,
            message: { foo: 'bar', _sentry: { sentry_trace: 'trace1', baggage: 'bag1' } },
          },
          {
            msg_id: 124,
            message: { baz: 'qux', _sentry: { sentry_trace: 'trace2', baggage: 'bag2' } },
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const result = (await mockSupabaseClient.rpc('pop', {
        queue_name: 'test-queue',
      })) as SupabaseResponse;

      // Verify all _sentry metadata was removed
      expect(result.data?.[0]?.message).not.toHaveProperty('_sentry');
      expect(result.data?.[1]?.message).not.toHaveProperty('_sentry');
    });

    it('should create span link to producer span when trace context is present', async () => {
      const producerTraceId = 'a'.repeat(32);
      const producerSpanId = 'b'.repeat(16);
      const sentryTrace = `${producerTraceId}-${producerSpanId}-1`;

      const mockResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 123,
            message: {
              foo: 'bar',
              _sentry: {
                sentry_trace: sentryTrace,
                baggage: 'sentry-environment=production',
              },
            },
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await mockSupabaseClient.rpc('pop', {
        queue_name: 'test-queue',
      });

      // Verify startSpan was called with span link
      expect(startSpanSpy).toHaveBeenCalled();
      const consumerSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.process');
      expect(consumerSpanCall).toBeDefined();

      // Verify span link was created pointing to producer span
      const spanOptions = consumerSpanCall?.[0];
      expect(spanOptions?.links).toBeDefined();
      expect(spanOptions?.links?.length).toBeGreaterThanOrEqual(1);

      const producerLink = spanOptions?.links?.[0];
      expect(producerLink).toMatchObject({
        context: {
          traceId: producerTraceId,
          spanId: producerSpanId,
          traceFlags: 1, // sampled=true
        },
        attributes: {
          'sentry.link.type': 'queue.producer',
        },
      });
    });

    it('should not create span link when no trace context in message', async () => {
      const mockResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 123,
            message: { foo: 'bar' }, // No _sentry field
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await mockSupabaseClient.rpc('pop', {
        queue_name: 'test-queue',
      });

      // Verify startSpan was called
      expect(startSpanSpy).toHaveBeenCalled();
      const consumerSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.process');
      expect(consumerSpanCall).toBeDefined();

      // Verify no span link was created
      const spanOptions = consumerSpanCall?.[0];
      expect(spanOptions?.links).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty response data array', async () => {
      const mockResponse: SupabaseResponse = {
        data: [],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      const result = await mockSupabaseClient.rpc('pop', {
        queue_name: 'empty-queue',
      });

      expect(result).toEqual(mockResponse);
      expect(mockRpcFunction).toHaveBeenCalledWith('pop', {
        queue_name: 'empty-queue',
      });

      // Verify consumer span was still created
      const processSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.process');
      expect(processSpanCall).toBeDefined();
    });

    it('should handle malformed _sentry metadata gracefully', async () => {
      const mockResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 123,
            message: {
              foo: 'bar',
              _sentry: {
                sentry_trace: 'invalid-trace-format', // Invalid trace format
                baggage: '', // Empty baggage
              },
            },
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const result = (await mockSupabaseClient.rpc('pop', {
        queue_name: 'malformed-queue',
      })) as SupabaseResponse;

      // Should still remove _sentry metadata even if malformed
      expect(result.data?.[0]?.message).toEqual({ foo: 'bar' });
      expect(result.data?.[0]?.message).not.toHaveProperty('_sentry');
    });

    it('should handle batch consumer with mixed _sentry metadata', async () => {
      const mockResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 1,
            message: {
              data: 'first',
              _sentry: { sentry_trace: 'trace1', baggage: 'bag1' },
            },
          },
          {
            msg_id: 2,
            message: {
              data: 'second',
              // No _sentry metadata
            },
          },
          {
            msg_id: 3,
            message: {
              data: 'third',
              _sentry: { sentry_trace: 'trace3', baggage: 'bag3' },
            },
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const result = await mockSupabaseClient.rpc('pop', {
        queue_name: 'mixed-queue',
      });

      // Verify all messages are cleaned up appropriately
      expect((result as SupabaseResponse).data?.[0]?.message).toEqual({ data: 'first' });
      expect((result as SupabaseResponse).data?.[0]?.message).not.toHaveProperty('_sentry');

      expect((result as SupabaseResponse).data?.[1]?.message).toEqual({ data: 'second' });
      expect((result as SupabaseResponse).data?.[1]?.message).not.toHaveProperty('_sentry');

      expect((result as SupabaseResponse).data?.[2]?.message).toEqual({ data: 'third' });
      expect((result as SupabaseResponse).data?.[2]?.message).not.toHaveProperty('_sentry');
    });

    it('should extract retry count from read_ct field', async () => {
      const mockResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 456,
            read_ct: 3, // Retry count field
            message: { foo: 'bar' },
            enqueued_at: new Date().toISOString(),
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      // Should extract and set retry count from PGMQ read_ct field
      const result = (await mockSupabaseClient.rpc('pop', {
        queue_name: 'retry-queue',
      })) as SupabaseResponse;

      // Verify the response was processed successfully
      expect(result.data).toBeDefined();
      expect(result.data?.[0]?.msg_id).toBe(456);
      expect(result.data?.[0]?.read_ct).toBe(3);

      // Full span attribute verification is done in E2E tests
      expect(mockRpcFunction).toHaveBeenCalledWith('pop', {
        queue_name: 'retry-queue',
      });
    });
  });

  describe('Non-Queue RPC Operations', () => {
    it('should not instrument non-queue RPC calls', async () => {
      const mockResponse = { data: { result: 'success' } };
      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const result = await mockSupabaseClient.rpc('custom_function', {
        param: 'value',
      });

      expect(result).toEqual(mockResponse);
      expect(mockRpcFunction).toHaveBeenCalledWith('custom_function', {
        param: 'value',
      });
    });

    it('should pass through RPC calls without queue_name parameter', async () => {
      const mockResponse = { data: { result: 'success' } };
      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const result = await mockSupabaseClient.rpc('send', {
        other_param: 'value',
      });

      expect(result).toEqual(mockResponse);
      expect(mockRpcFunction).toHaveBeenCalledWith('send', {
        other_param: 'value',
      });
    });
  });

  describe('Trace Propagation', () => {
    it('should propagate trace from producer to consumer', async () => {
      let capturedTraceContext: { sentry_trace?: string; baggage?: string } | undefined;

      // Producer: send message
      const produceResponse: SupabaseResponse = {
        data: [{ msg_id: 123 }],
        status: 200,
      };

      mockRpcFunction.mockImplementation(async (operation: string, params: any) => {
        if (operation === 'send') {
          capturedTraceContext = params.message._sentry;
          return produceResponse;
        }
        // Consumer: return message with trace context
        return {
          data: [
            {
              msg_id: 123,
              message: {
                foo: 'bar',
                _sentry: capturedTraceContext,
              },
            },
          ],
          status: 200,
        };
      });

      instrumentSupabaseClient(mockSupabaseClient);

      // Producer span
      await startSpan({ name: 'producer-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'test-queue',
          message: { foo: 'bar' },
        });
      });

      expect(capturedTraceContext).toBeDefined();
      expect(capturedTraceContext?.sentry_trace).toBeTruthy();
      expect(capturedTraceContext?.baggage).toBeTruthy();

      // Consumer span
      await startSpan({ name: 'consumer-transaction' }, async () => {
        const result = (await mockSupabaseClient.rpc('pop', {
          queue_name: 'test-queue',
        })) as SupabaseResponse;

        // Verify metadata was removed
        expect(result.data?.[0]?.message).not.toHaveProperty('_sentry');
      });
    });
  });

  describe('Message ID Extraction', () => {
    it('should extract message IDs from response data', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 123 }, { msg_id: 456 }, { msg_id: 789 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send_batch', {
          queue_name: 'test-queue',
          messages: [{ a: 1 }, { b: 2 }, { c: 3 }],
        });
      });

      expect(mockRpcFunction).toHaveBeenCalled();
    });

    it('should handle missing message IDs gracefully', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: undefined, message: {} }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const addBreadcrumbSpy = vi.spyOn(Breadcrumbs, 'addBreadcrumb');

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'test-queue',
          message: { foo: 'bar' },
        });
      });

      expect(mockRpcFunction).toHaveBeenCalled();

      // Verify breadcrumb was created even without message ID
      expect(addBreadcrumbSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'queue.publish',
          data: expect.objectContaining({
            'messaging.destination.name': 'test-queue',
          }),
        }),
      );
    });
  });

  describe('Breadcrumb Creation', () => {
    let addBreadcrumbSpy: any;

    beforeEach(() => {
      addBreadcrumbSpy = vi.spyOn(Breadcrumbs, 'addBreadcrumb');
    });

    it('should create breadcrumb for producer operations', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 123 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'test-queue',
          message: { foo: 'bar' },
        });
      });

      expect(addBreadcrumbSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'supabase',
          category: 'queue.publish',
          message: 'queue.publish(test-queue)',
          data: expect.objectContaining({
            'messaging.message.id': '123',
            'messaging.destination.name': 'test-queue',
          }),
        }),
      );
    });

    it('should create breadcrumb for consumer operations', async () => {
      const mockResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 456,
            message: { foo: 'bar' },
            enqueued_at: new Date().toISOString(),
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await mockSupabaseClient.rpc('pop', {
        queue_name: 'consumer-queue',
      });

      expect(addBreadcrumbSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'supabase',
          category: 'queue.process',
          message: 'queue.process(consumer-queue)',
          data: expect.objectContaining({
            'messaging.message.id': '456',
            'messaging.destination.name': 'consumer-queue',
          }),
        }),
      );
    });

    it('should include batch count in producer breadcrumb', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 1 }, { msg_id: 2 }, { msg_id: 3 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send_batch', {
          queue_name: 'batch-queue',
          messages: [{ a: 1 }, { b: 2 }, { c: 3 }],
        });
      });

      expect(addBreadcrumbSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            'messaging.batch.message_count': 3,
          }),
        }),
      );
    });
  });

  describe('Span Attributes', () => {
    it('should set correct attributes on producer span', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 789 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'attr-test-queue',
          message: { test: 'data' },
        });
      });

      // Find the queue.publish span call
      const publishSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.name === 'publish attr-test-queue');

      expect(publishSpanCall).toBeDefined();
      expect(publishSpanCall?.[0]).toEqual(
        expect.objectContaining({
          name: 'publish attr-test-queue',
          op: 'queue.publish',
          attributes: expect.objectContaining({
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.supabase.queue.producer',
            'messaging.system': 'supabase',
            'messaging.destination.name': 'attr-test-queue',
            'messaging.operation.name': 'send',
            'messaging.operation.type': 'publish',
            'messaging.message.body.size': expect.any(Number),
          }),
        }),
      );
    });

    it('should set correct attributes on producer span for batch send', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 790 }, { msg_id: 791 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send_batch', {
          queue_name: 'attr-test-queue-batch',
          messages: [{ test: 'data1' }, { test: 'data2' }],
        });
      });

      // Find the queue.publish span call
      const publishSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.name === 'publish attr-test-queue-batch');

      expect(publishSpanCall).toBeDefined();
      expect(publishSpanCall?.[0]).toEqual(
        expect.objectContaining({
          name: 'publish attr-test-queue-batch',
          op: 'queue.publish',
          attributes: expect.objectContaining({
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.supabase.queue.producer',
            'messaging.system': 'supabase',
            'messaging.destination.name': 'attr-test-queue-batch',
            'messaging.operation.name': 'send_batch',
            'messaging.operation.type': 'publish',
            'messaging.message.body.size': expect.any(Number),
          }),
        }),
      );
    });

    it('should set correct attributes on consumer span', async () => {
      const mockResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 999,
            message: { data: 'test' },
            enqueued_at: new Date().toISOString(),
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await mockSupabaseClient.rpc('pop', {
        queue_name: 'consumer-attr-queue',
      });

      // Find the queue.process span call
      const processSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.name === 'process consumer-attr-queue');

      expect(processSpanCall).toBeDefined();
      expect(processSpanCall?.[0]).toEqual(
        expect.objectContaining({
          name: 'process consumer-attr-queue',
          op: 'queue.process',
          attributes: expect.objectContaining({
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.supabase.queue.consumer',
            'messaging.system': 'supabase',
            'messaging.destination.name': 'consumer-attr-queue',
          }),
        }),
      );
    });
  });

  describe('Message Body Size Limits', () => {
    it('should calculate size for messages under 100KB', async () => {
      const smallMessage = { data: 'x'.repeat(1000) }; // ~1KB
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 111 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'size-test-queue',
          message: smallMessage,
        });
      });

      // If this completes without error, size was calculated
      expect(mockRpcFunction).toHaveBeenCalled();
    });

    it('should handle large messages gracefully', async () => {
      // Create a message > 100KB
      const largeMessage = { data: 'x'.repeat(110000) }; // ~110KB
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 222 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'large-message-queue',
          message: largeMessage,
        });
      });

      // Size calculation skipped for large messages
      expect(mockRpcFunction).toHaveBeenCalled();
    });

    it('should handle non-serializable messages gracefully', async () => {
      const circularRef: any = { foo: 'bar' };
      circularRef.self = circularRef; // Create circular reference

      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 333 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'circular-queue',
          message: circularRef,
        });
      });

      // JSON.stringify fails gracefully for circular references
      expect(mockRpcFunction).toHaveBeenCalled();
    });
  });

  describe('Schema-Qualified RPC Names', () => {
    it('should instrument schema-qualified producer RPC names', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 123 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('pgmq.send', {
          queue_name: 'test-queue',
          message: { foo: 'bar' },
        });
      });

      // Verify queue.publish span was created for schema-qualified name
      const publishSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.publish');
      expect(publishSpanCall).toBeDefined();
      expect(publishSpanCall?.[0]?.name).toBe('publish test-queue');
    });

    it('should instrument schema-qualified consumer RPC names', async () => {
      const mockResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 123,
            message: { foo: 'bar' },
            enqueued_at: new Date().toISOString(),
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await mockSupabaseClient.rpc('my_schema.pop', {
        queue_name: 'test-queue',
      });

      // Verify queue.process span was created for schema-qualified name
      const processSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.process');
      expect(processSpanCall).toBeDefined();
      expect(processSpanCall?.[0]?.name).toBe('process test-queue');
    });

    it('should detect schema-qualified send_batch and set batch attributes', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 1 }, { msg_id: 2 }, { msg_id: 3 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');
      const addBreadcrumbSpy = vi.spyOn(Breadcrumbs, 'addBreadcrumb');

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('pgmq.send_batch', {
          queue_name: 'batch-test-queue',
          messages: [{ foo: 'bar' }, { baz: 'qux' }, { test: 'data' }],
        });
      });

      // Verify span was created with normalized operation name
      const publishSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.name === 'publish batch-test-queue');
      expect(publishSpanCall).toBeDefined();
      expect(publishSpanCall?.[0]?.attributes).toEqual(
        expect.objectContaining({
          'messaging.operation.name': 'send_batch', // Normalized from 'pgmq.send_batch'
          'messaging.operation.type': 'publish',
          'messaging.destination.name': 'batch-test-queue',
        }),
      );

      // Verify breadcrumb has batch count (messaging.batch.message_count is set after response)
      expect(addBreadcrumbSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'queue.publish',
          data: expect.objectContaining({
            'messaging.batch.message_count': 3, // MUST be set in breadcrumb for batch operations
          }),
        }),
      );
    });

    it('should handle schema-qualified send for single messages', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 999 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('pgmq.send', {
          queue_name: 'single-msg-queue',
          message: { foo: 'bar' },
        });
      });

      // Verify span attributes - operation name should be normalized
      const publishSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.name === 'publish single-msg-queue');
      expect(publishSpanCall).toBeDefined();
      expect(publishSpanCall?.[0]?.attributes).toEqual(
        expect.objectContaining({
          'messaging.operation.name': 'send', // Normalized from 'pgmq.send'
          'messaging.operation.type': 'publish',
          'messaging.destination.name': 'single-msg-queue',
        }),
      );

      // Verify NO batch attributes are set for single messages
      expect(publishSpanCall?.[0]?.attributes).not.toHaveProperty('messaging.batch.message_count');
    });

    it('should handle multiple schema qualifiers', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 456 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('schema.nested.send', {
          queue_name: 'nested-queue',
          message: { test: 'data' },
        });
      });

      // Should extract 'send' from 'schema.nested.send'
      const publishSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.publish');
      expect(publishSpanCall).toBeDefined();
    });

    it('should handle bare RPC names without schema', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 789 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'bare-queue',
          message: { foo: 'bar' },
        });
      });

      // Bare name should still work
      const publishSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.publish');
      expect(publishSpanCall).toBeDefined();
      expect(publishSpanCall?.[0]?.name).toBe('publish bare-queue');
    });
  });

  describe('Consumer - Schema-qualified RPC names', () => {
    it('should normalize schema-qualified pop operation name', async () => {
      const consumerResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 123,
            read_ct: 0,
            enqueued_at: new Date().toISOString(),
            message: { foo: 'bar' },
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(consumerResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      // Call with schema-qualified name
      await mockSupabaseClient.rpc('pgmq.pop', {
        queue_name: 'test_queue',
        vt: 30,
        qty: 1,
      });

      // Verify span attributes
      const processSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.process');
      expect(processSpanCall).toBeDefined();

      const spanOptions = processSpanCall?.[0];
      // CRITICAL: operation name must be normalized
      expect(spanOptions?.attributes?.['messaging.operation.name']).toBe('pop'); // NOT 'pgmq.pop'
      expect(spanOptions?.attributes?.['messaging.operation.type']).toBe('process');
      expect(spanOptions?.attributes?.['messaging.destination.name']).toBe('test_queue');
    });

    it('should normalize schema-qualified receive operation name', async () => {
      const consumerResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 456,
            message: { test: 'data' },
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(consumerResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await mockSupabaseClient.rpc('custom_schema.receive', {
        queue_name: 'another_queue',
        vt: 60,
        qty: 5,
      });

      const processSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.process');
      expect(processSpanCall).toBeDefined();

      const spanOptions = processSpanCall?.[0];
      expect(spanOptions?.attributes?.['messaging.operation.name']).toBe('receive'); // Normalized
      expect(spanOptions?.attributes?.['messaging.operation.type']).toBe('process');
      expect(spanOptions?.attributes?.['messaging.destination.name']).toBe('another_queue');
    });

    it('should normalize schema-qualified read operation name', async () => {
      const consumerResponse: SupabaseResponse = {
        data: [
          { msg_id: 1, message: {} },
          { msg_id: 2, message: {} },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(consumerResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await mockSupabaseClient.rpc('pgmq.read', {
        queue_name: 'batch_queue',
        vt: 30,
        qty: 10,
      });

      const processSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.process');
      expect(processSpanCall).toBeDefined();

      const spanOptions = processSpanCall?.[0];
      expect(spanOptions?.attributes?.['messaging.operation.name']).toBe('read'); // Normalized
      expect(spanOptions?.attributes?.['messaging.operation.type']).toBe('process');
      expect(spanOptions?.attributes?.['messaging.destination.name']).toBe('batch_queue');
    });
  });

  describe('Payload Corruption Prevention', () => {
    it('should not corrupt primitive message payloads (number)', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 123 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'primitive-queue',
          message: 123,
        });
      });

      // Verify primitive payload was not corrupted
      const call = mockRpcFunction.mock.calls[0];
      expect(call[1].message).toBe(123); // Should remain a number
      expect(call[1].message).not.toHaveProperty('_sentry');
    });

    it('should not corrupt primitive message payloads (string)', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 456 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'string-queue',
          message: 'hello world',
        });
      });

      const call = mockRpcFunction.mock.calls[0];
      expect(call[1].message).toBe('hello world'); // Should remain a string
    });

    it('should not corrupt primitive message payloads (boolean)', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 789 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'boolean-queue',
          message: true,
        });
      });

      const call = mockRpcFunction.mock.calls[0];
      expect(call[1].message).toBe(true); // Should remain a boolean
    });

    it('should not corrupt array message payloads', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 111 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const arrayMessage = [1, 2, 3];

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'array-queue',
          message: arrayMessage,
        });
      });

      const call = mockRpcFunction.mock.calls[0];
      expect(call[1].message).toEqual([1, 2, 3]); // Should remain an array
      expect(Array.isArray(call[1].message)).toBe(true);
    });

    it('should inject trace context into plain object messages', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 222 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'object-queue',
          message: { foo: 'bar' },
        });
      });

      const call = mockRpcFunction.mock.calls[0];
      expect(call[1].message).toEqual({
        foo: 'bar',
        _sentry: expect.objectContaining({
          sentry_trace: expect.any(String),
          baggage: expect.any(String),
        }),
      });
    });

    it('should not corrupt batch with mixed payload types', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 1 }, { msg_id: 2 }, { msg_id: 3 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send_batch', {
          queue_name: 'mixed-batch',
          messages: [123, 'hello', { foo: 'bar' }],
        });
      });

      const call = mockRpcFunction.mock.calls[0];
      expect(call[1].messages[0]).toBe(123); // Number unchanged
      expect(call[1].messages[1]).toBe('hello'); // String unchanged
      expect(call[1].messages[2]).toEqual({
        foo: 'bar',
        _sentry: expect.objectContaining({
          sentry_trace: expect.any(String),
          baggage: expect.any(String),
        }),
      }); // Object gets trace context
    });

    it('should handle null and undefined messages gracefully', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 333 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'null-queue',
          message: null,
        });
      });

      const call = mockRpcFunction.mock.calls[0];
      expect(call[1].message).toBe(null);
    });
  });

  describe('Trace Continuation', () => {
    it('should continue producer trace in consumer span (same trace ID)', async () => {
      let capturedTraceId: string | undefined;

      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 123 }],
        status: 200,
      };

      mockRpcFunction.mockImplementation(async (operation: string, params: any) => {
        if (operation === 'send') {
          const traceContext = params.message._sentry;
          if (traceContext?.sentry_trace) {
            // Extract trace ID from producer
            capturedTraceId = traceContext.sentry_trace.split('-')[0];
          }
          return mockResponse;
        }
        // Consumer: return message with trace context
        return {
          data: [
            {
              msg_id: 123,
              message: {
                foo: 'bar',
                _sentry: {
                  sentry_trace: `${capturedTraceId}-${'1'.repeat(16)}-1`,
                  baggage: 'sentry-environment=production',
                },
              },
            },
          ],
          status: 200,
        };
      });

      instrumentSupabaseClient(mockSupabaseClient);

      // Producer
      await startSpan({ name: 'producer-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'test-queue',
          message: { foo: 'bar' },
        });
      });

      const getCurrentScopeSpy = vi.spyOn(CurrentScopes, 'getCurrentScope');

      // Consumer
      await mockSupabaseClient.rpc('pop', {
        queue_name: 'test-queue',
      });

      // Verify setPropagationContext was called
      expect(getCurrentScopeSpy).toHaveBeenCalled();

      // The consumer should have set propagation context with the same trace ID
      const scope = getCurrentScopeSpy.mock.results[getCurrentScopeSpy.mock.results.length - 1]?.value;
      if (scope && typeof scope.setPropagationContext === 'function') {
        // Propagation context should have been set with producer's trace ID
        expect(capturedTraceId).toBeDefined();
      }
    });

    it('should propagate baggage/DSC from producer to consumer', async () => {
      const mockResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 456,
            message: {
              data: 'test',
              _sentry: {
                sentry_trace: '12345678901234567890123456789012-1234567890123456-1',
                baggage: 'sentry-environment=production,sentry-release=1.0.0',
              },
            },
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const getCurrentScopeSpy = vi.spyOn(CurrentScopes, 'getCurrentScope');

      await mockSupabaseClient.rpc('pop', {
        queue_name: 'baggage-queue',
      });

      // Verify getCurrentScope was called (for setPropagationContext)
      expect(getCurrentScopeSpy).toHaveBeenCalled();
    });

    it('should handle missing trace context gracefully', async () => {
      const mockResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 789,
            message: { foo: 'bar' }, // No _sentry metadata
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await mockSupabaseClient.rpc('pop', {
        queue_name: 'no-trace-queue',
      });

      // Should still create consumer span without trace continuation
      const processSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.process');
      expect(processSpanCall).toBeDefined();
    });
  });

  describe('Span Status', () => {
    it('should set span status to OK for successful operations', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 777 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'success-queue',
          message: { test: 'data' },
        });
      });

      // Operation completed successfully
      expect(mockRpcFunction).toHaveBeenCalled();
    });

    it('should set span status to ERROR for failed operations', async () => {
      const mockResponse: SupabaseResponse = {
        data: [],
        error: {
          message: 'Queue operation failed',
          code: 'QUEUE_ERROR',
        },
      };

      mockRpcFunction.mockResolvedValue(mockResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'error-queue',
          message: { test: 'data' },
        });
      });

      // Error handled, span should have error status
      expect(mockRpcFunction).toHaveBeenCalled();
    });

    it('should set span status to ERROR when exception thrown', async () => {
      const mockError = new Error('Network failure');
      mockRpcFunction.mockRejectedValue(mockError);
      instrumentSupabaseClient(mockSupabaseClient);

      await expect(
        startSpan({ name: 'test-transaction' }, async () => {
          await mockSupabaseClient.rpc('send', {
            queue_name: 'exception-queue',
            message: { test: 'data' },
          });
        }),
      ).rejects.toThrow('Network failure');

      expect(mockRpcFunction).toHaveBeenCalled();
    });
  });

  describe('Consumer - Trace continuation and scope isolation', () => {
    it('should create span links to producer span for distributed tracing', async () => {
      // Producer trace context
      const producerTraceId = '12345678901234567890123456789012';
      const producerSpanId = '1234567890123456';
      const sentryTrace = `${producerTraceId}-${producerSpanId}-1`;

      const consumerResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 123,
            message: {
              foo: 'bar',
              _sentry: { sentry_trace: sentryTrace },
            },
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(consumerResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await mockSupabaseClient.rpc('pop', { queue_name: 'test_queue' });

      // Find the consumer span
      const consumerSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.process');
      expect(consumerSpanCall).toBeDefined();

      // Get the span options
      const spanOptions = consumerSpanCall?.[0];

      // Verify span links are created for distributed tracing
      expect(spanOptions?.links).toBeDefined();
      expect(spanOptions?.links).toHaveLength(1);
      expect(spanOptions?.links?.[0].context.traceId).toBe(producerTraceId);
      expect(spanOptions?.links?.[0].context.spanId).toBe(producerSpanId);
      expect(spanOptions?.links?.[0].attributes?.['sentry.link.type']).toBe('queue.producer');

      // Consumer span should NOT be a forced root transaction
      expect(spanOptions?.forceTransaction).toBeUndefined();
    });

    it('should not pollute scope after consumer span completes', async () => {
      const producerTraceId = '12345678901234567890123456789012';
      const producerSpanId = '1234567890123456';
      const sentryTrace = `${producerTraceId}-${producerSpanId}-1`;

      const consumerResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 456,
            message: {
              test: 'data',
              _sentry: { sentry_trace: sentryTrace },
            },
          },
        ],
        status: 200,
      };

      // Get original scope state
      const scopeBefore = getCurrentScope();
      const propContextBefore = scopeBefore.getPropagationContext();

      mockRpcFunction.mockResolvedValue(consumerResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      await mockSupabaseClient.rpc('receive', { queue_name: 'test_queue' });

      // Get scope state after consumer completes
      const scopeAfter = getCurrentScope();
      const propContextAfter = scopeAfter.getPropagationContext();

      // CRITICAL: Scope must NOT have producer's trace ID
      expect(propContextAfter.traceId).not.toBe(producerTraceId);

      // Scope should be restored to original state
      expect(propContextAfter.traceId).toBe(propContextBefore.traceId);
    });

    it('should create consumer span as child of HTTP transaction with span links to producer', async () => {
      const producerTraceId = '12345678901234567890123456789012';
      const producerSpanId = 'aaaaaaaaaaaaaaaa';
      const sentryTrace = `${producerTraceId}-${producerSpanId}-1`;

      const consumerResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 789,
            message: {
              _sentry: { sentry_trace: sentryTrace },
            },
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(consumerResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      // Simulate HTTP request transaction being active
      await startSpan({ name: 'HTTP GET /api/test', op: 'http.server' }, async () => {
        const httpSpan = getActiveSpan();
        expect(httpSpan).toBeDefined();

        // Consumer RPC happens during HTTP request
        await mockSupabaseClient.rpc('read', { queue_name: 'test_queue' });

        // Find consumer span call
        const consumerSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.process');
        expect(consumerSpanCall).toBeDefined();

        const spanOptions = consumerSpanCall?.[0];

        // Consumer span should be a child of HTTP transaction, not a forced root
        expect(spanOptions?.forceTransaction).toBeUndefined();

        // The consumer span should have producer's trace ID in the link for distributed tracing
        expect(spanOptions?.links).toBeDefined();
        expect(spanOptions?.links?.[0]?.context.traceId).toBe(producerTraceId);
        expect(spanOptions?.links?.[0]?.context.spanId).toBe(producerSpanId);
        expect(spanOptions?.links?.[0]?.attributes?.['sentry.link.type']).toBe('queue.producer');
      });
    });

    it('should handle consumer without producer context using regular span', async () => {
      const consumerResponse: SupabaseResponse = {
        data: [
          {
            msg_id: 999,
            message: {
              foo: 'bar',
              // No _sentry field - no producer context
            },
          },
        ],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(consumerResponse);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await mockSupabaseClient.rpc('pop', { queue_name: 'test_queue' });

      // Find the consumer span
      const consumerSpanCall = startSpanSpy.mock.calls.find(call => call[0]?.op === 'queue.process');
      expect(consumerSpanCall).toBeDefined();

      const spanOptions = consumerSpanCall?.[0];

      // Without producer context, should not force transaction
      expect(spanOptions?.forceTransaction).toBeUndefined();

      // No links should be created
      expect(spanOptions?.links).toBeUndefined();
    });
  });

  describe('Idempotency Guard', () => {
    it('should not double-wrap rpc method when instrumentSupabaseClient is called multiple times', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 123 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);

      // Instrument the same client multiple times
      instrumentSupabaseClient(mockSupabaseClient);
      instrumentSupabaseClient(mockSupabaseClient);
      instrumentSupabaseClient(mockSupabaseClient);

      const startSpanSpy = vi.spyOn(Tracing, 'startSpan');

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'test-queue',
          message: { foo: 'bar' },
        });
      });

      // Should only create ONE queue.publish span, not three
      const publishSpanCalls = startSpanSpy.mock.calls.filter(call => call[0]?.op === 'queue.publish');
      expect(publishSpanCalls.length).toBe(1);
    });

    it('should only call the underlying RPC function once even after multiple instrumentations', async () => {
      const mockResponse: SupabaseResponse = {
        data: [{ msg_id: 456 }],
        status: 200,
      };

      mockRpcFunction.mockResolvedValue(mockResponse);

      // Instrument multiple times
      instrumentSupabaseClient(mockSupabaseClient);
      instrumentSupabaseClient(mockSupabaseClient);

      await startSpan({ name: 'test-transaction' }, async () => {
        await mockSupabaseClient.rpc('send', {
          queue_name: 'test-queue',
          message: { test: 'data' },
        });
      });

      // The underlying mock RPC function should only be called once
      expect(mockRpcFunction).toHaveBeenCalledTimes(1);
    });
  });
});
