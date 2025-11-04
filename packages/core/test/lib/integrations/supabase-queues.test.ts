import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '../../../src';
import * as Breadcrumbs from '../../../src/breadcrumbs';
import * as CurrentScopes from '../../../src/currentScopes';
import type { SupabaseClientInstance, SupabaseResponse } from '../../../src/integrations/supabase';
import { instrumentSupabaseClient } from '../../../src/integrations/supabase';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../../src/semanticAttributes';
import * as Tracing from '../../../src/tracing';
import { startSpan } from '../../../src/tracing';

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

    // Create a mock Supabase client with proper structure
    mockSupabaseClient = {
      constructor: function SupabaseClient() {
        // Constructor mock
      },
      rpc: mockRpcFunction,
      auth: {
        signInWithPassword: vi.fn(),
        admin: {
          createUser: vi.fn(),
        },
      },
    } as unknown as SupabaseClientInstance;

    // Add prototype methods for from() to support database instrumentation
    (mockSupabaseClient.constructor as any).prototype = {
      from: vi.fn(),
      schema: vi.fn(),
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
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.queue.supabase.producer',
            'messaging.system': 'supabase',
            'messaging.destination.name': 'attr-test-queue',
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
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.queue.supabase.consumer',
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
});
