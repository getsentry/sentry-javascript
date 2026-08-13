import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as currentScopes from '../../../../src/currentScopes';
import * as exports from '../../../../src/exports';
import { wrapMcpServerWithSentry } from '../../../../src/integrations/mcp-server';
import {
  buildTransportAttributes,
  extractSessionDataFromInitializeRequest,
  extractSessionDataFromInitializeResponse,
  extractSessionDataFromMessage,
  extractSessionDataFromResponse,
  getTransportTypes,
} from '../../../../src/integrations/mcp-server/sessionExtraction';
import {
  cleanupSessionDataForTransport,
  getClientInfoForTransport,
  getProtocolVersionForTransport,
  getSessionDataForTransport,
  storeSessionDataForTransport,
  updateSessionDataForTransport,
} from '../../../../src/integrations/mcp-server/sessionManagement';
import { buildMcpServerSpanConfig } from '../../../../src/integrations/mcp-server/spans';
import {
  wrapTransportError,
  wrapTransportOnClose,
  wrapTransportOnMessage,
  wrapTransportSend,
} from '../../../../src/integrations/mcp-server/transport';
import * as tracingModule from '../../../../src/tracing';
import * as spanUtils from '../../../../src/utils/spanUtils';
import * as traceDataModule from '../../../../src/utils/traceData';
import {
  createMockClient,
  createMockMcpServer,
  createMockSseTransport,
  createMockStdioTransport,
  createMockTransport,
  createMockWrapperTransport,
} from './testUtils';

describe('MCP Server Transport Instrumentation', () => {
  const startSpanSpy = vi.spyOn(tracingModule, 'startSpan');
  const startInactiveSpanSpy = vi.spyOn(tracingModule, 'startInactiveSpan');
  const startNewTraceSpy = vi.spyOn(tracingModule, 'startNewTrace');
  const continueTraceSpy = vi.spyOn(tracingModule, 'continueTrace');
  const getActiveSpanSpy = vi.spyOn(spanUtils, 'getActiveSpan');
  const getTraceDataSpy = vi.spyOn(traceDataModule, 'getTraceData');
  const getClientSpy = vi.spyOn(currentScopes, 'getClient');
  const captureExceptionSpy = vi.spyOn(exports, 'captureException');

  beforeEach(() => {
    vi.clearAllMocks();
    getClientSpy.mockReturnValue(createMockClient(true));
    getActiveSpanSpy.mockReturnValue(undefined);
    getTraceDataSpy.mockReturnValue({});
  });

  describe('Transport-level instrumentation', () => {
    let mockMcpServer: ReturnType<typeof createMockMcpServer>;
    let wrappedMcpServer: ReturnType<typeof createMockMcpServer>;
    let mockTransport: ReturnType<typeof createMockTransport>;
    let originalConnect: any;

    beforeEach(() => {
      mockMcpServer = createMockMcpServer();
      originalConnect = mockMcpServer.connect;
      wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      mockTransport = createMockTransport();
    });

    it('should proxy the connect method', () => {
      // We need to test this before connection, so create fresh instances
      const freshMockMcpServer = createMockMcpServer();
      const originalConnect = freshMockMcpServer.connect;

      const freshWrappedMcpServer = wrapMcpServerWithSentry(freshMockMcpServer);

      expect(freshWrappedMcpServer.connect).not.toBe(originalConnect);
    });

    it('should intercept transport onmessage handler', async () => {
      const originalOnMessage = mockTransport.onmessage;

      await wrappedMcpServer.connect(mockTransport);

      // onmessage should be wrapped after connection
      expect(mockTransport.onmessage).not.toBe(originalOnMessage);
    });

    it('should intercept transport send handler', async () => {
      const originalSend = mockTransport.send;

      await wrappedMcpServer.connect(mockTransport);

      // send should be wrapped after connection
      expect(mockTransport.send).not.toBe(originalSend);
    });

    it('should intercept transport onclose handler', async () => {
      const originalOnClose = mockTransport.onclose;

      await wrappedMcpServer.connect(mockTransport);

      // onclose should be wrapped after connection
      expect(mockTransport.onclose).not.toBe(originalOnClose);
    });

    it('should call original connect and preserve functionality', async () => {
      await wrappedMcpServer.connect(mockTransport);

      // Check the original spy was called
      expect(originalConnect).toHaveBeenCalledWith(mockTransport);
    });

    it('should create spans for incoming JSON-RPC requests', async () => {
      await wrappedMcpServer.connect(mockTransport);

      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'req-1',
        params: { name: 'get-weather' },
      };

      // Simulate incoming message
      mockTransport.onmessage?.(jsonRpcRequest, {});

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tools/call get-weather',
          attributes: expect.objectContaining({
            'gen_ai.operation.name': 'execute_tool',
            'gen_ai.tool.name': 'get-weather',
            'jsonrpc.request.id': 'req-1',
            'sentry.kind': 'server',
          }),
        }),
      );
    });

    it('uses the ambient transport span as parent when no MCP context is provided', async () => {
      const ambientContext = {
        traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        spanId: 'bbbbbbbbbbbbbbbb',
        traceFlags: 1,
      };
      const ambientSpan = {
        spanContext: () => ambientContext,
        isRecording: vi.fn().mockReturnValue(true),
      };
      getActiveSpanSpy.mockReturnValue(ambientSpan as any);
      await wrappedMcpServer.connect(mockTransport);

      mockTransport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 'no-mcp-context',
        },
        {},
      );

      expect(startNewTraceSpy).not.toHaveBeenCalled();
      expect(continueTraceSpy).not.toHaveBeenCalled();
      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tools/list',
          parentSpan: ambientSpan,
        }),
      );
      expect(startInactiveSpanSpy).toHaveBeenCalledWith(expect.not.objectContaining({ links: expect.anything() }));
    });

    it('continues MCP trace context and links the independent ambient transport span', async () => {
      const ambientContext = {
        traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        spanId: 'bbbbbbbbbbbbbbbb',
        traceFlags: 1,
      };
      getActiveSpanSpy.mockReturnValue({
        spanContext: () => ambientContext,
        isRecording: vi.fn().mockReturnValue(true),
      } as any);
      await wrappedMcpServer.connect(mockTransport);

      mockTransport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 'continued-mcp-context',
          params: {
            _meta: {
              traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
              tracestate: 'vendor=value',
              baggage: 'sentry-release=1.0.0',
            },
          },
        },
        {},
      );

      expect(continueTraceSpy).toHaveBeenCalledWith(
        {
          sentryTrace: '4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-1',
          baggage: 'sentry-release=1.0.0',
        },
        expect.any(Function),
      );
      expect(startNewTraceSpy).not.toHaveBeenCalled();
      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tools/list',
          links: [{ context: ambientContext }],
          attributes: expect.not.objectContaining({
            baggage: expect.anything(),
            traceparent: expect.anything(),
            tracestate: expect.anything(),
          }),
        }),
      );
    });

    it('should create spans for incoming JSON-RPC notifications', async () => {
      await wrappedMcpServer.connect(mockTransport);

      const jsonRpcNotification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        // No 'id' field - this makes it a notification
      };

      // Simulate incoming notification
      mockTransport.onmessage?.(jsonRpcNotification, {});

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'notifications/initialized',
          attributes: expect.objectContaining({
            'sentry.kind': 'server',
          }),
        }),
        expect.any(Function),
      );
    });

    it('should create spans for outgoing notifications', async () => {
      await wrappedMcpServer.connect(mockTransport);

      const outgoingNotification = {
        jsonrpc: '2.0',
        method: 'notifications/tools/list_changed',
        // No 'id' field
      };

      // Simulate outgoing notification
      await mockTransport.send?.(outgoingNotification);

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'notifications/tools/list_changed',
          attributes: expect.objectContaining({
            'sentry.kind': 'client',
          }),
        }),
        expect.any(Function),
      );
    });

    it('should not create spans for non-JSON-RPC messages', async () => {
      await wrappedMcpServer.connect(mockTransport);

      // Simulate non-JSON-RPC message
      mockTransport.onmessage?.({ some: 'data' }, {});

      expect(startSpanSpy).not.toHaveBeenCalled();
    });

    it('should handle transport onclose events', async () => {
      await wrappedMcpServer.connect(mockTransport);
      mockTransport.sessionId = 'test-session-123';

      // Trigger onclose - should not throw
      expect(() => mockTransport.onclose?.()).not.toThrow();
    });

    it('should set span status to error when JSON-RPC error response is sent', async () => {
      const mockSpan = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
        isRecording: vi.fn().mockReturnValue(true),
      };
      startInactiveSpanSpy.mockReturnValue(mockSpan as any);

      await wrappedMcpServer.connect(mockTransport);

      // Simulate an incoming tools/call request
      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'req-err-1',
        params: { name: 'always-error' },
      };
      mockTransport.onmessage?.(jsonRpcRequest, {});

      // Simulate the MCP SDK sending back a JSON-RPC error response
      const jsonRpcErrorResponse = {
        jsonrpc: '2.0',
        id: 'req-err-1',
        error: { code: -32603, message: 'Internal error: tool threw an exception' },
      };
      await mockTransport.send?.(jsonRpcErrorResponse as any);

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'error.type': '-32603',
        'rpc.response.status_code': '-32603',
      });
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2,
        message: 'Internal error: tool threw an exception',
      });
      expect(captureExceptionSpy).not.toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it.each([-32020, -32021, -32022])(
      'should treat JSON-RPC error %s as a caller fault without creating an Issue',
      async errorCode => {
        const mockSpan = {
          setAttributes: vi.fn(),
          setStatus: vi.fn(),
          end: vi.fn(),
          isRecording: vi.fn().mockReturnValue(true),
        };
        startInactiveSpanSpy.mockReturnValue(mockSpan as any);

        await wrappedMcpServer.connect(mockTransport);
        mockTransport.onmessage?.(
          {
            jsonrpc: '2.0',
            method: 'tools/call',
            id: `req-caller-${errorCode}`,
            params: {
              name: 'caller-error',
              _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
            },
          },
          {},
        );

        await mockTransport.send?.({
          jsonrpc: '2.0',
          id: `req-caller-${errorCode}`,
          error: { code: errorCode, message: 'The client request is not acceptable' },
        });

        expect(mockSpan.setAttributes).toHaveBeenCalledWith({
          'rpc.response.status_code': String(errorCode),
        });
        expect(mockSpan.setStatus).not.toHaveBeenCalled();
        expect(captureExceptionSpy).not.toHaveBeenCalled();
        expect(mockSpan.end).toHaveBeenCalledOnce();
      },
    );

    it('should not set error span status for successful JSON-RPC responses', async () => {
      const mockSpan = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
        isRecording: vi.fn().mockReturnValue(true),
      };
      startInactiveSpanSpy.mockReturnValue(mockSpan as any);

      await wrappedMcpServer.connect(mockTransport);

      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'req-ok-1',
        params: { name: 'echo' },
      };
      mockTransport.onmessage?.(jsonRpcRequest, {});

      const jsonRpcSuccessResponse = {
        jsonrpc: '2.0',
        id: 'req-ok-1',
        result: { content: [{ type: 'text', text: 'hello' }] },
      };
      await mockTransport.send?.(jsonRpcSuccessResponse as any);

      expect(mockSpan.setStatus).not.toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('completes an in-flight response before deferred close cleanup', async () => {
      let resolveSend: (() => void) | undefined;
      mockTransport.send = vi.fn(
        () =>
          new Promise<void>(resolve => {
            resolveSend = resolve;
          }),
      );
      const mockSpan = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
        isRecording: vi.fn().mockReturnValue(true),
      };
      startInactiveSpanSpy.mockReturnValue(mockSpan as any);
      await wrappedMcpServer.connect(mockTransport);

      mockTransport.onmessage?.({ jsonrpc: '2.0', method: 'tools/list', id: 'response-in-flight', params: {} }, {});
      const sendPromise = mockTransport.send?.({
        jsonrpc: '2.0',
        id: 'response-in-flight',
        result: { tools: [{ name: 'weather' }] },
      });

      expect(mockSpan.end).not.toHaveBeenCalled();
      mockTransport.onclose?.();
      expect(mockSpan.end).not.toHaveBeenCalled();

      resolveSend?.();
      await sendPromise;

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({ 'mcp.result.count': 1 });
      expect(mockSpan.setAttributes).not.toHaveBeenCalledWith({ 'mcp.request.outcome': 'cancelled' });
      expect(mockSpan.end).toHaveBeenCalledOnce();
    });

    it('does not let a per-request transport close beat response completion', async () => {
      const mockSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(mockSpan as any);
      mockTransport.send = vi.fn(message => {
        if ('result' in message || 'error' in message) {
          queueMicrotask(() => mockTransport.onclose?.());
        }
        return Promise.resolve();
      });
      await wrappedMcpServer.connect(mockTransport);

      mockTransport.onmessage?.({ jsonrpc: '2.0', method: 'tools/list', id: 'per-request-close' }, {});
      await mockTransport.send?.({
        jsonrpc: '2.0',
        id: 'per-request-close',
        result: { tools: [{ name: 'weather' }] },
      });
      await new Promise(resolve => setTimeout(resolve));

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({ 'mcp.result.count': 1 });
      expect(mockSpan.setAttributes).not.toHaveBeenCalledWith({ 'mcp.request.outcome': 'cancelled' });
      expect(mockSpan.end).toHaveBeenCalledOnce();
    });

    it('cleans up pending spans when the original onclose handler throws', async () => {
      const closeError = new Error('close handler failed');
      const mockSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(mockSpan as any);
      mockTransport.onclose = vi.fn(() => {
        throw closeError;
      });
      await wrappedMcpServer.connect(mockTransport);

      mockTransport.onmessage?.({ jsonrpc: '2.0', method: 'tools/list', id: 'throwing-close' }, {});
      expect(() => mockTransport.onclose?.()).toThrow(closeError);
      await new Promise(resolve => setTimeout(resolve));

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({ 'mcp.request.outcome': 'cancelled' });
      expect(mockSpan.end).toHaveBeenCalledOnce();
    });

    it('marks the request span as failed and preserves an asynchronous response send rejection', async () => {
      const sendError = new Error('socket closed');
      mockTransport.send = vi.fn().mockRejectedValue(sendError);
      const mockSpan = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
        isRecording: vi.fn().mockReturnValue(true),
      };
      startInactiveSpanSpy.mockReturnValue(mockSpan as any);
      await wrappedMcpServer.connect(mockTransport);

      mockTransport.onmessage?.({ jsonrpc: '2.0', method: 'tools/list', id: 'send-rejected', params: {} }, {});

      await expect(mockTransport.send?.({ jsonrpc: '2.0', id: 'send-rejected', result: { tools: [] } })).rejects.toBe(
        sendError,
      );
      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'error.type': 'Error',
        'mcp.request.outcome': 'send_error',
      });
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: 'transport_send_error' });
      expect(mockSpan.end).toHaveBeenCalledOnce();
    });

    it('marks the request span as failed and preserves a synchronous response send error', async () => {
      const sendError = new TypeError('invalid response state');
      mockTransport.send = vi.fn(() => {
        throw sendError;
      });
      const mockSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(mockSpan as any);
      await wrappedMcpServer.connect(mockTransport);

      mockTransport.onmessage?.({ jsonrpc: '2.0', method: 'tools/list', id: 'send-threw', params: {} }, {});

      expect(() => mockTransport.send?.({ jsonrpc: '2.0', id: 'send-threw', result: { tools: [] } })).toThrow(
        sendError,
      );
      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'error.type': 'TypeError',
        'mcp.request.outcome': 'send_error',
      });
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: 'transport_send_error' });
      expect(mockSpan.end).toHaveBeenCalledOnce();
    });

    it('ends only the explicitly cancelled request while the connection remains open', async () => {
      const firstSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      const secondSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValueOnce(firstSpan as any).mockReturnValueOnce(secondSpan as any);
      await wrappedMcpServer.connect(mockTransport);

      mockTransport.onmessage?.(
        { jsonrpc: '2.0', method: 'tools/call', id: 'cancel-me', params: { name: 'slow' } },
        {},
      );
      mockTransport.onmessage?.(
        { jsonrpc: '2.0', method: 'tools/call', id: 'keep-running', params: { name: 'fast' } },
        {},
      );
      mockTransport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'notifications/cancelled',
          params: { requestId: 'cancel-me', reason: 'user requested' },
        },
        {},
      );

      expect(firstSpan.setAttributes).toHaveBeenCalledWith({ 'mcp.request.outcome': 'cancelled' });
      expect(firstSpan.setStatus).not.toHaveBeenCalled();
      expect(firstSpan.end).toHaveBeenCalledOnce();
      expect(secondSpan.end).not.toHaveBeenCalled();

      await mockTransport.send?.({ jsonrpc: '2.0', id: 'cancel-me', result: {} });
      expect(firstSpan.end).toHaveBeenCalledOnce();
      await mockTransport.send?.({ jsonrpc: '2.0', id: 'keep-running', result: {} });
      expect(secondSpan.end).toHaveBeenCalledOnce();
    });

    it('injects outgoing notification trace context and preserves related MCP metadata', async () => {
      const originalSend = mockTransport.send;
      const requestSpan = {
        spanContext: () => ({ traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spanId: 'bbbbbbbbbbbbbbbb' }),
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      };
      startInactiveSpanSpy.mockReturnValue(requestSpan as any);
      getTraceDataSpy.mockReturnValue({
        'sentry-trace': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-cccccccccccccccc-1',
        traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-cccccccccccccccc-01',
        baggage: 'sentry-release=2.0.0',
      });
      await wrappedMcpServer.connect(mockTransport);

      mockTransport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          id: 'related-request',
          params: {
            name: 'slow',
            _meta: {
              traceparent: '00-11111111111111111111111111111111-2222222222222222-01',
              tracestate: 'vendor=value',
              baggage: 'tenant=alpha',
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            },
          },
        },
        {},
      );
      await mockTransport.send?.(
        {
          jsonrpc: '2.0',
          method: 'notifications/progress',
          params: {
            progressToken: 'progress-1',
            progress: 1,
            _meta: { 'io.modelcontextprotocol/subscriptionId': 'subscription-1', baggage: 'tenant=beta' },
          },
        },
        { relatedRequestId: 'related-request' },
      );

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'notifications/progress',
          parentSpan: requestSpan,
          attributes: expect.objectContaining({
            'mcp.protocol.version': '2026-07-28',
            'sentry.kind': 'client',
          }),
        }),
        expect.any(Function),
      );
      expect(originalSend).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            _meta: {
              'io.modelcontextprotocol/subscriptionId': 'subscription-1',
              traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-cccccccccccccccc-01',
              tracestate: 'vendor=value',
              baggage: 'tenant=beta,sentry-release=2.0.0',
            },
          }),
        }),
        { relatedRequestId: 'related-request' },
      );
    });

    it('drops a stale traceparent when no current context can be injected', async () => {
      const originalSend = mockTransport.send;
      await wrappedMcpServer.connect(mockTransport);

      await mockTransport.send?.({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: {
          progressToken: 'progress-1',
          progress: 1,
          _meta: {
            traceparent: '00-11111111111111111111111111111111-2222222222222222-01',
            'com.example/custom': 'preserved',
          },
        },
      });

      expect(originalSend).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: {
          progressToken: 'progress-1',
          progress: 1,
          _meta: { 'com.example/custom': 'preserved' },
        },
      });
    });

    it('correlates R=O=0 independently and accepts a string response id for the numeric outgoing id', async () => {
      const originalSend = mockTransport.send;
      const incomingSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      const outgoingSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValueOnce(incomingSpan as any).mockReturnValueOnce(outgoingSpan as any);
      getTraceDataSpy.mockReturnValue({
        traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01',
        baggage: 'sentry-release=2.0.0',
      });
      await wrappedMcpServer.connect(mockTransport);

      mockTransport.onmessage?.({ jsonrpc: '2.0', method: 'tools/call', id: 0, params: { name: 'delegate' } }, {});
      await mockTransport.send?.(
        {
          jsonrpc: '2.0',
          method: 'sampling/createMessage',
          id: 0,
          params: {
            messages: [],
            _meta: {
              traceparent: '00-11111111111111111111111111111111-2222222222222222-00',
              tracestate: `vendor=${'a'.repeat(506)}`,
              baggage: `tenant=${'a'.repeat(8186)}`,
              'com.example/custom': 'preserved',
            },
          },
        },
        { relatedRequestId: 0 },
      );

      expect(startInactiveSpanSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          name: 'sampling/createMessage',
          op: 'mcp.client',
          parentSpan: incomingSpan,
          attributes: expect.objectContaining({
            'jsonrpc.request.id': '0',
            'mcp.method.name': 'sampling/createMessage',
            'sentry.kind': 'client',
          }),
        }),
      );
      expect(originalSend).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            _meta: {
              traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01',
              baggage: 'sentry-release=2.0.0',
              'com.example/custom': 'preserved',
            },
          }),
        }),
        { relatedRequestId: 0 },
      );

      mockTransport.onmessage?.({ jsonrpc: '2.0', id: '0', result: { model: 'test-model' } }, {});
      expect(outgoingSpan.end).toHaveBeenCalledOnce();
      expect(incomingSpan.end).not.toHaveBeenCalled();

      await mockTransport.send?.({ jsonrpc: '2.0', id: 0, result: { content: [] } });
      expect(incomingSpan.end).toHaveBeenCalledOnce();
    });

    it('matches the SDK numeric coercion for legacy response ids', async () => {
      const outgoingSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(outgoingSpan as any);
      await wrappedMcpServer.connect(mockTransport);

      await mockTransport.send?.({ jsonrpc: '2.0', method: 'sampling/createMessage', id: 0 });
      mockTransport.onmessage?.({ jsonrpc: '2.0', id: '00', result: {} }, {});

      expect(outgoingSpan.end).toHaveBeenCalledOnce();
    });

    it('stores outgoing correlation before a transport synchronously delivers the response', async () => {
      const outgoingSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(outgoingSpan as any);
      mockTransport.send = vi.fn(message => {
        if ('method' in message && 'id' in message) {
          mockTransport.onmessage?.({ jsonrpc: '2.0', id: message.id, result: { model: 'test-model' } }, {});
        }
        return Promise.resolve();
      });
      await wrappedMcpServer.connect(mockTransport);

      await mockTransport.send?.({
        jsonrpc: '2.0',
        method: 'sampling/createMessage',
        id: 'synchronous-response',
        params: { messages: [] },
      });

      expect(outgoingSpan.end).toHaveBeenCalledOnce();
    });

    it('keeps an outgoing span open until asynchronous response processing completes', async () => {
      let resolveResponse: (() => void) | undefined;
      mockTransport.onmessage = vi.fn(
        () =>
          new Promise<void>(resolve => {
            resolveResponse = resolve;
          }),
      ) as any;
      const outgoingSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(outgoingSpan as any);
      await wrappedMcpServer.connect(mockTransport);
      await mockTransport.send?.({
        jsonrpc: '2.0',
        method: 'sampling/createMessage',
        id: 'async-response',
        params: { messages: [] },
      });

      const responsePromise = mockTransport.onmessage?.(
        { jsonrpc: '2.0', id: 'async-response', result: { model: 'test-model' } },
        {},
      ) as unknown as Promise<void>;
      expect(outgoingSpan.end).not.toHaveBeenCalled();

      resolveResponse?.();
      await responsePromise;
      expect(outgoingSpan.end).toHaveBeenCalledOnce();
    });

    it('fails an outgoing span when asynchronous response processing rejects', async () => {
      const responseError = new TypeError('response handler rejected');
      mockTransport.onmessage = vi.fn().mockRejectedValue(responseError) as any;
      const outgoingSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(outgoingSpan as any);
      await wrappedMcpServer.connect(mockTransport);
      await mockTransport.send?.({
        jsonrpc: '2.0',
        method: 'sampling/createMessage',
        id: 'response-rejection',
        params: { messages: [] },
      });

      await expect(
        mockTransport.onmessage?.({ jsonrpc: '2.0', id: 'response-rejection', result: {} }, {}) as unknown,
      ).rejects.toBe(responseError);
      expect(outgoingSpan.setAttributes).toHaveBeenCalledWith({
        'error.type': 'TypeError',
        'mcp.request.outcome': 'response_error',
      });
      expect(outgoingSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: 'response_processing_error' });
      expect(outgoingSpan.end).toHaveBeenCalledOnce();
    });

    it('records every outgoing JSON-RPC error and bounds its status message', async () => {
      const outgoingSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(outgoingSpan as any);
      await wrappedMcpServer.connect(mockTransport);
      await mockTransport.send?.({
        jsonrpc: '2.0',
        method: 'sampling/createMessage',
        id: 'client-error-response',
        params: { messages: [] },
      });

      mockTransport.onmessage?.(
        {
          jsonrpc: '2.0',
          id: 'client-error-response',
          error: { code: -32601, message: 'x'.repeat(1_000) },
        },
        {},
      );

      expect(outgoingSpan.setAttributes).toHaveBeenCalledWith({
        'error.type': '-32601',
        'rpc.response.status_code': '-32601',
      });
      expect(outgoingSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: `${'x'.repeat(253)}...` });
      expect(outgoingSpan.end).toHaveBeenCalledOnce();
    });

    it('fails an outgoing request span when its asynchronous send rejects', async () => {
      const sendError = new Error('client disconnected');
      const outgoingSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(outgoingSpan as any);
      mockTransport.send = vi.fn().mockRejectedValue(sendError);
      await wrappedMcpServer.connect(mockTransport);

      await expect(
        mockTransport.send?.({
          jsonrpc: '2.0',
          method: 'sampling/createMessage',
          id: 'outgoing-send-error',
          params: { messages: [] },
        }),
      ).rejects.toBe(sendError);

      expect(outgoingSpan.setAttributes).toHaveBeenCalledWith({
        'error.type': 'Error',
        'mcp.request.outcome': 'send_error',
      });
      expect(outgoingSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: 'transport_send_error' });
      expect(outgoingSpan.end).toHaveBeenCalledOnce();
    });

    it('cancels an outgoing request exactly once when sending notifications/cancelled', async () => {
      let resolveCancellation: (() => void) | undefined;
      const outgoingSpan = {
        spanContext: () => ({ traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spanId: 'bbbbbbbbbbbbbbbb' }),
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      };
      startInactiveSpanSpy.mockReturnValue(outgoingSpan as any);
      mockTransport.send = vi.fn(message =>
        'method' in message && message.method === 'notifications/cancelled'
          ? new Promise<void>(resolve => {
              resolveCancellation = resolve;
            })
          : Promise.resolve(),
      );
      await wrappedMcpServer.connect(mockTransport);

      await mockTransport.send?.({
        jsonrpc: '2.0',
        method: 'sampling/createMessage',
        id: 'cancel-outgoing',
        params: { messages: [] },
      });
      const cancellationPromise = mockTransport.send?.({
        jsonrpc: '2.0',
        method: 'notifications/cancelled',
        params: { requestId: 'cancel-outgoing', reason: 'server stopped' },
      });

      expect(outgoingSpan.end).not.toHaveBeenCalled();
      resolveCancellation?.();
      await cancellationPromise;

      expect(outgoingSpan.setAttributes).toHaveBeenCalledWith({ 'mcp.request.outcome': 'cancelled' });
      expect(outgoingSpan.end).toHaveBeenCalledOnce();

      mockTransport.onclose?.();
      await new Promise(resolve => setTimeout(resolve));
      mockTransport.onmessage?.({ jsonrpc: '2.0', id: 'cancel-outgoing', result: {} }, {});
      expect(outgoingSpan.end).toHaveBeenCalledOnce();
    });

    it('waits for cancellation delivery and leaves the request open when delivery rejects', async () => {
      const sendError = new Error('cancellation delivery failed');
      const outgoingSpan = {
        spanContext: () => ({ traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spanId: 'bbbbbbbbbbbbbbbb' }),
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      };
      startInactiveSpanSpy.mockReturnValue(outgoingSpan as any);
      mockTransport.send = vi.fn(message =>
        'method' in message && message.method === 'notifications/cancelled'
          ? Promise.reject(sendError)
          : Promise.resolve(),
      );
      await wrappedMcpServer.connect(mockTransport);
      await mockTransport.send?.({
        jsonrpc: '2.0',
        method: 'sampling/createMessage',
        id: 'failed-cancellation',
        params: { messages: [] },
      });

      await expect(
        mockTransport.send?.({
          jsonrpc: '2.0',
          method: 'notifications/cancelled',
          params: { requestId: 'failed-cancellation' },
        }),
      ).rejects.toBe(sendError);
      expect(outgoingSpan.setAttributes).not.toHaveBeenCalledWith({ 'mcp.request.outcome': 'cancelled' });
      expect(outgoingSpan.end).not.toHaveBeenCalled();

      mockTransport.onclose?.();
      await new Promise(resolve => setTimeout(resolve));
      expect(outgoingSpan.setAttributes).toHaveBeenCalledWith({ 'mcp.request.outcome': 'cancelled' });
      expect(outgoingSpan.end).toHaveBeenCalledOnce();
    });

    it('does not let delayed cancellation delivery finish a replacement with the same id', async () => {
      let resolveCancellation: (() => void) | undefined;
      const firstOutgoingSpan = {
        spanContext: () => ({ traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spanId: 'bbbbbbbbbbbbbbbb' }),
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      };
      const replacementSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValueOnce(firstOutgoingSpan as any).mockReturnValueOnce(replacementSpan as any);
      mockTransport.send = vi.fn(message =>
        'method' in message && message.method === 'notifications/cancelled'
          ? new Promise<void>(resolve => {
              resolveCancellation = resolve;
            })
          : Promise.resolve(),
      );
      await wrappedMcpServer.connect(mockTransport);

      await mockTransport.send?.({ jsonrpc: '2.0', method: 'sampling/createMessage', id: 'reused-cancellation' });
      const cancellationPromise = mockTransport.send?.({
        jsonrpc: '2.0',
        method: 'notifications/cancelled',
        params: { requestId: 'reused-cancellation' },
      });
      await mockTransport.send?.({ jsonrpc: '2.0', method: 'sampling/createMessage', id: 'reused-cancellation' });

      resolveCancellation?.();
      await cancellationPromise;
      expect(firstOutgoingSpan.end).toHaveBeenCalledOnce();
      expect(replacementSpan.end).not.toHaveBeenCalled();

      mockTransport.onmessage?.({ jsonrpc: '2.0', id: 'reused-cancellation', result: {} }, {});
      expect(replacementSpan.end).toHaveBeenCalledOnce();
    });

    it('terminates duplicate ids in each direction instead of silently overwriting spans', async () => {
      const firstIncomingSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      const secondIncomingSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      const firstOutgoingSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      const secondOutgoingSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy
        .mockReturnValueOnce(firstIncomingSpan as any)
        .mockReturnValueOnce(secondIncomingSpan as any)
        .mockReturnValueOnce(firstOutgoingSpan as any)
        .mockReturnValueOnce(secondOutgoingSpan as any);
      await wrappedMcpServer.connect(mockTransport);

      mockTransport.onmessage?.({ jsonrpc: '2.0', method: 'tools/list', id: 'duplicate-incoming' }, {});
      mockTransport.onmessage?.({ jsonrpc: '2.0', method: 'tools/list', id: 'duplicate-incoming' }, {});
      expect(firstIncomingSpan.setAttributes).toHaveBeenCalledWith({
        'error.type': 'duplicate_request_id',
        'mcp.request.outcome': 'request_id_reused',
      });
      expect(firstIncomingSpan.end).toHaveBeenCalledOnce();
      expect(secondIncomingSpan.end).not.toHaveBeenCalled();

      await mockTransport.send?.({ jsonrpc: '2.0', method: 'sampling/createMessage', id: 'duplicate-outgoing' });
      await mockTransport.send?.({ jsonrpc: '2.0', method: 'sampling/createMessage', id: 'duplicate-outgoing' });
      expect(firstOutgoingSpan.setAttributes).toHaveBeenCalledWith({
        'error.type': 'duplicate_request_id',
        'mcp.request.outcome': 'request_id_reused',
      });
      expect(firstOutgoingSpan.end).toHaveBeenCalledOnce();
      expect(secondOutgoingSpan.end).not.toHaveBeenCalled();
    });

    it('does not let a late rejection for a reused id finish the replacement outgoing span', async () => {
      let rejectFirstSend: ((error: Error) => void) | undefined;
      const firstSendError = new Error('first send failed late');
      const firstOutgoingSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      const secondOutgoingSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValueOnce(firstOutgoingSpan as any).mockReturnValueOnce(secondOutgoingSpan as any);
      mockTransport.send = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<void>((_resolve, reject) => {
              rejectFirstSend = reject;
            }),
        )
        .mockResolvedValueOnce(undefined);
      await wrappedMcpServer.connect(mockTransport);

      const firstSend = mockTransport.send?.({
        jsonrpc: '2.0',
        method: 'sampling/createMessage',
        id: 'reused-outgoing',
      });
      await mockTransport.send?.({
        jsonrpc: '2.0',
        method: 'sampling/createMessage',
        id: 'reused-outgoing',
      });
      rejectFirstSend?.(firstSendError);
      await expect(firstSend).rejects.toBe(firstSendError);

      expect(firstOutgoingSpan.end).toHaveBeenCalledOnce();
      expect(secondOutgoingSpan.end).not.toHaveBeenCalled();
      mockTransport.onmessage?.({ jsonrpc: '2.0', id: 'reused-outgoing', result: {} }, {});
      expect(secondOutgoingSpan.end).toHaveBeenCalledOnce();
    });

    it('does not let delayed processing for a reused response id finish the replacement outgoing span', async () => {
      let resolveFirstResponse: (() => void) | undefined;
      const originalOnMessage = mockTransport.onmessage;
      mockTransport.onmessage = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<void>(resolve => {
              resolveFirstResponse = resolve;
            }),
        )
        .mockImplementation((...args: unknown[]) => originalOnMessage?.(...args)) as any;
      const firstOutgoingSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      const secondOutgoingSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValueOnce(firstOutgoingSpan as any).mockReturnValueOnce(secondOutgoingSpan as any);
      await wrappedMcpServer.connect(mockTransport);
      await mockTransport.send?.({ jsonrpc: '2.0', method: 'sampling/createMessage', id: 'reused-response' });

      const firstResponse = mockTransport.onmessage?.(
        { jsonrpc: '2.0', id: 'reused-response', result: { model: 'first' } },
        {},
      ) as unknown as Promise<void>;
      await mockTransport.send?.({ jsonrpc: '2.0', method: 'sampling/createMessage', id: 'reused-response' });
      expect(firstOutgoingSpan.end).toHaveBeenCalledOnce();

      resolveFirstResponse?.();
      await firstResponse;
      expect(secondOutgoingSpan.end).not.toHaveBeenCalled();
      mockTransport.onmessage?.({ jsonrpc: '2.0', id: 'reused-response', result: { model: 'second' } }, {});
      expect(secondOutgoingSpan.end).toHaveBeenCalledOnce();
    });
  });

  describe('Stdio Transport Tests', () => {
    let mockMcpServer: ReturnType<typeof createMockMcpServer>;
    let wrappedMcpServer: ReturnType<typeof createMockMcpServer>;
    let mockStdioTransport: ReturnType<typeof createMockStdioTransport>;

    beforeEach(() => {
      mockMcpServer = createMockMcpServer();
      wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer, { recordInputs: true });
      mockStdioTransport = createMockStdioTransport();
      mockStdioTransport.sessionId = 'stdio-session-456';
    });

    it('should detect stdio transport and set correct attributes', async () => {
      await wrappedMcpServer.connect(mockStdioTransport);

      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'req-stdio-1',
        params: { name: 'process-file', arguments: { path: '/tmp/data.txt' } },
      };

      mockStdioTransport.onmessage?.(jsonRpcRequest, {});

      expect(startInactiveSpanSpy).toHaveBeenCalledWith({
        name: 'tools/call process-file',
        op: 'mcp.server',
        attributes: {
          'gen_ai.operation.name': 'execute_tool',
          'gen_ai.tool.call.arguments': '{"path":"/tmp/data.txt"}',
          'gen_ai.tool.name': 'process-file',
          'jsonrpc.request.id': 'req-stdio-1',
          'mcp.method.name': 'tools/call',
          'mcp.tool.name': 'process-file',
          'mcp.request.id': 'req-stdio-1',
          'mcp.session.id': 'stdio-session-456',
          'mcp.transport': 'StdioServerTransport',
          'network.transport': 'pipe', // Should be pipe, not tcp
          'mcp.request.argument.path': '"/tmp/data.txt"',
          'sentry.kind': 'server',
          'sentry.op': 'mcp.server',
          'sentry.origin': 'auto.function.mcp_server',
        },
      });
    });

    it('should handle stdio transport notifications correctly', async () => {
      await wrappedMcpServer.connect(mockStdioTransport);

      const notification = {
        jsonrpc: '2.0',
        method: 'notifications/message',
        params: {
          level: 'debug',
          data: 'Processing stdin input',
        },
      };

      mockStdioTransport.onmessage?.(notification, {});

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'notifications/message',
          attributes: expect.objectContaining({
            'mcp.method.name': 'notifications/message',
            'mcp.session.id': 'stdio-session-456',
            'mcp.transport': 'StdioServerTransport',
            'network.transport': 'pipe',
            'mcp.logging.level': 'debug',
            'mcp.logging.message': 'Processing stdin input',
          }),
        }),
        expect.any(Function),
      );
    });
  });

  describe('SSE Transport Tests (Backwards Compatibility)', () => {
    let mockMcpServer: ReturnType<typeof createMockMcpServer>;
    let wrappedMcpServer: ReturnType<typeof createMockMcpServer>;
    let mockSseTransport: ReturnType<typeof createMockSseTransport>;

    beforeEach(() => {
      mockMcpServer = createMockMcpServer();
      wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      mockSseTransport = createMockSseTransport();
      mockSseTransport.sessionId = 'sse-session-789';
    });

    it('should detect SSE transport for backwards compatibility', async () => {
      await wrappedMcpServer.connect(mockSseTransport);

      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'resources/read',
        id: 'req-sse-1',
        params: { uri: 'https://api.example.com/data' },
      };

      mockSseTransport.onmessage?.(jsonRpcRequest, {});

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'resources/read',
          attributes: expect.objectContaining({
            'mcp.method.name': 'resources/read',
            'mcp.resource.uri': 'https://api.example.com/data',
            'mcp.transport': 'SSEServerTransport',
            'network.transport': 'tcp',
            'mcp.session.id': 'sse-session-789',
          }),
        }),
      );
    });
  });

  describe('Direct Transport Function Tests', () => {
    let mockTransport: ReturnType<typeof createMockTransport>;

    beforeEach(() => {
      mockTransport = createMockTransport();
      mockTransport.sessionId = 'test-session-direct';
    });

    it('should test wrapTransportOnMessage directly', () => {
      const originalOnMessage = mockTransport.onmessage;

      wrapTransportOnMessage(mockTransport, { recordInputs: false, recordOutputs: false });

      expect(mockTransport.onmessage).not.toBe(originalOnMessage);
    });

    it('should test wrapTransportSend directly', () => {
      const originalSend = mockTransport.send;

      wrapTransportSend(mockTransport, { recordInputs: false, recordOutputs: false });

      expect(mockTransport.send).not.toBe(originalSend);
    });

    it('should test wrapTransportOnClose directly', () => {
      const originalOnClose = mockTransport.onclose;

      wrapTransportOnClose(mockTransport);

      expect(mockTransport.onclose).not.toBe(originalOnClose);
    });

    it('should test wrapTransportError directly', () => {
      const originalOnError = mockTransport.onerror;

      wrapTransportError(mockTransport);

      expect(mockTransport.onerror).not.toBe(originalOnError);
    });

    it('should test buildMcpServerSpanConfig directly', () => {
      const jsonRpcRequest = {
        jsonrpc: '2.0' as const,
        method: 'tools/call',
        id: 'req-direct-test',
        params: { name: 'test-tool', arguments: { input: 'test' } },
      };

      const config = buildMcpServerSpanConfig(
        jsonRpcRequest,
        mockTransport,
        {
          requestInfo: {
            remoteAddress: '127.0.0.1',
            remotePort: 8080,
          },
        },
        { recordInputs: true, recordOutputs: true },
      );

      expect(config).toEqual({
        name: 'tools/call test-tool',
        op: 'mcp.server',
        attributes: {
          'gen_ai.operation.name': 'execute_tool',
          'gen_ai.tool.call.arguments': '{"input":"test"}',
          'gen_ai.tool.name': 'test-tool',
          'jsonrpc.request.id': 'req-direct-test',
          'mcp.method.name': 'tools/call',
          'mcp.tool.name': 'test-tool',
          'mcp.request.id': 'req-direct-test',
          'mcp.session.id': 'test-session-direct',
          'client.address': '127.0.0.1',
          'client.port': 8080,
          'mcp.transport': 'StreamableHTTPServerTransport',
          'network.transport': 'tcp',
          'network.protocol.name': 'http',
          'mcp.request.argument.input': '"test"',
          'sentry.kind': 'server',
          'sentry.op': 'mcp.server',
          'sentry.origin': 'auto.function.mcp_server',
        },
      });
    });
  });

  describe('Session Management', () => {
    let mockTransport: ReturnType<typeof createMockTransport>;

    beforeEach(() => {
      mockTransport = createMockTransport();
      mockTransport.sessionId = 'test-session-123';
    });

    it('should extract session data from initialize request', () => {
      const initializeRequest = {
        jsonrpc: '2.0' as const,
        method: 'initialize',
        id: 'init-1',
        params: {
          protocolVersion: '2025-06-18',
          clientInfo: {
            name: 'test-client',
            title: 'Test Client',
            version: '1.0.0',
          },
        },
      };

      const sessionData = extractSessionDataFromInitializeRequest(initializeRequest);

      expect(sessionData).toEqual({
        protocolVersion: '2025-06-18',
        clientInfo: {
          name: 'test-client',
          title: 'Test Client',
          version: '1.0.0',
        },
      });
    });

    it('should extract session data from initialize response', () => {
      const initializeResponse = {
        protocolVersion: '2025-06-18',
        serverInfo: {
          name: 'test-server',
          title: 'Test Server',
          version: '2.0.0',
        },
        capabilities: {},
      };

      const sessionData = extractSessionDataFromInitializeResponse(initializeResponse);

      expect(sessionData).toEqual({
        protocolVersion: '2025-06-18',
        serverInfo: {
          name: 'test-server',
          title: 'Test Server',
          version: '2.0.0',
        },
      });
    });

    it('extracts session data from a modern request envelope', () => {
      const request = {
        jsonrpc: '2.0' as const,
        method: 'tools/call',
        id: 'modern-tool-call',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': {
              name: 'modern-client',
              title: 'Modern Client',
              version: '2.0.0',
            },
            'io.modelcontextprotocol/clientCapabilities': {
              roots: {},
              sampling: {},
              extensions: {
                'com.example/approval': {},
              },
            },
          },
          name: 'weather',
        },
      };

      const sessionData = extractSessionDataFromMessage(request);

      expect(sessionData).toEqual({
        protocolVersion: '2026-07-28',
        clientInfo: {
          name: 'modern-client',
          title: 'Modern Client',
          version: '2.0.0',
        },
        clientCapabilities: ['roots', 'sampling'],
        clientExtensionIds: ['com.example/approval'],
      });
    });

    it('extracts server info from modern result metadata', () => {
      const result = {
        resultType: 'complete',
        content: [],
        _meta: {
          'io.modelcontextprotocol/serverInfo': {
            name: 'modern-server',
            title: 'Modern Server',
            version: '2.0.0',
          },
        },
      };

      const sessionData = extractSessionDataFromResponse(result);

      expect(sessionData).toEqual({
        serverInfo: {
          name: 'modern-server',
          title: 'Modern Server',
          version: '2.0.0',
        },
      });
    });

    it('should store and retrieve session data', () => {
      const sessionData = {
        protocolVersion: '2025-06-18',
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      };

      storeSessionDataForTransport(mockTransport, sessionData);

      expect(getSessionDataForTransport(mockTransport)).toEqual(sessionData);
      expect(getProtocolVersionForTransport(mockTransport)).toBe('2025-06-18');
      expect(getClientInfoForTransport(mockTransport)).toEqual({
        name: 'test-client',
        version: '1.0.0',
      });
    });

    it('should update existing session data', () => {
      const initialData = {
        protocolVersion: '2025-06-18',
        clientInfo: { name: 'test-client' },
      };

      storeSessionDataForTransport(mockTransport, initialData);

      const serverData = {
        serverInfo: { name: 'test-server', version: '2.0.0' },
      };

      updateSessionDataForTransport(mockTransport, serverData);

      const updatedData = getSessionDataForTransport(mockTransport);
      expect(updatedData).toEqual({
        protocolVersion: '2025-06-18',
        clientInfo: { name: 'test-client' },
        serverInfo: { name: 'test-server', version: '2.0.0' },
      });
    });

    it('isolates session data for transports that reuse the same session id', () => {
      const firstTransport = createMockTransport();
      const secondTransport = createMockTransport();
      firstTransport.sessionId = 'shared-session-id';
      secondTransport.sessionId = 'shared-session-id';

      storeSessionDataForTransport(firstTransport, { protocolVersion: '2025-06-18' });
      storeSessionDataForTransport(secondTransport, { protocolVersion: '2026-07-28' });

      expect(getProtocolVersionForTransport(firstTransport)).toBe('2025-06-18');
      expect(getProtocolVersionForTransport(secondTransport)).toBe('2026-07-28');

      cleanupSessionDataForTransport(firstTransport);
      expect(getSessionDataForTransport(firstTransport)).toBeUndefined();
      expect(getProtocolVersionForTransport(secondTransport)).toBe('2026-07-28');
    });

    it('should clean up session data', () => {
      const sessionData = {
        protocolVersion: '2025-06-18',
        clientInfo: { name: 'test-client' },
      };

      storeSessionDataForTransport(mockTransport, sessionData);
      expect(getSessionDataForTransport(mockTransport)).toEqual(sessionData);

      cleanupSessionDataForTransport(mockTransport);
      expect(getSessionDataForTransport(mockTransport)).toBeUndefined();
    });

    it('stores data by transport identity even when no session id is present', () => {
      const transportWithoutSession = {
        onmessage: vi.fn(),
        onclose: vi.fn(),
        onerror: vi.fn(),
        send: vi.fn().mockResolvedValue(undefined),
        protocolVersion: '2025-06-18',
        // No sessionId
      };

      const sessionData = { protocolVersion: '2025-06-18' };

      storeSessionDataForTransport(transportWithoutSession, sessionData);
      expect(getSessionDataForTransport(transportWithoutSession)).toEqual(sessionData);
    });
  });

  describe('Transport Type Detection', () => {
    it('extracts HTTP transport name correctly', () => {
      const transport = createMockTransport();
      const result = getTransportTypes(transport);

      expect(result.mcpTransport).toBe('StreamableHTTPServerTransport');
      expect(result.networkTransport).toBe('tcp');
    });

    it('extracts stdio transport and maps to pipe network', () => {
      const transport = createMockStdioTransport();
      const result = getTransportTypes(transport);

      expect(result.mcpTransport).toBe('StdioServerTransport');
      expect(result.networkTransport).toBe('pipe');
    });

    it('extracts SSE transport name', () => {
      const transport = createMockSseTransport();
      const result = getTransportTypes(transport);

      expect(result.mcpTransport).toBe('SSEServerTransport');
      expect(result.networkTransport).toBe('tcp');
    });

    it('handles transport without constructor', () => {
      const transport = Object.create(null);
      const result = getTransportTypes(transport);

      expect(result.mcpTransport).toBe('unknown');
      expect(result.networkTransport).toBe('unknown');
    });

    it('handles transport with null/undefined constructor name', () => {
      const transport = {
        constructor: { name: null },
        onmessage: () => {},
        send: async () => {},
      };
      const result = getTransportTypes(transport);

      expect(result.mcpTransport).toBe('unknown');
      expect(result.networkTransport).toBe('unknown');
    });

    it('returns unknown network transport for unrecognized transport types', () => {
      const transport = {
        constructor: { name: 'CustomTransport' },
        onmessage: () => {},
        send: async () => {},
      };
      const result = getTransportTypes(transport);

      expect(result.mcpTransport).toBe('CustomTransport');
      expect(result.networkTransport).toBe('unknown');
    });
  });

  describe('buildTransportAttributes sessionId handling', () => {
    it('includes sessionId when present', () => {
      const transport = createMockTransport();
      const attributes = buildTransportAttributes(transport);

      expect(attributes['mcp.session.id']).toBe('test-session-123');
    });

    it('excludes sessionId when undefined', () => {
      const transport = createMockTransport();
      transport.sessionId = '';
      const attributes = buildTransportAttributes(transport);

      expect(attributes['mcp.session.id']).toBeUndefined();
    });

    it('excludes sessionId when not present in transport', () => {
      const transport = { onmessage: () => {}, send: async () => {} };
      const attributes = buildTransportAttributes(transport);

      expect(attributes['mcp.session.id']).toBeUndefined();
    });
  });

  describe('Protocol Metadata Span Attributes', () => {
    it('should add client info to initialize span on request', async () => {
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      const transport = createMockTransport();
      transport.sessionId = '';

      await wrappedMcpServer.connect(transport);

      const mockSpan = { setAttributes: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(mockSpan);

      transport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'initialize',
          id: 'init-1',
          params: { protocolVersion: '2025-06-18', clientInfo: { name: 'test-client', version: '1.0.0' } },
        },
        {},
      );

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'mcp.client.name': 'test-client',
            'mcp.client.version': '1.0.0',
            'mcp.protocol.version': '2025-06-18',
          }),
        }),
      );
      expect(mockSpan.setAttributes).not.toHaveBeenCalled();
    });

    it('should add server info to initialize span on response', async () => {
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      const transport = createMockTransport();

      await wrappedMcpServer.connect(transport);

      const mockSpan = { setAttributes: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(mockSpan as any);

      transport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'initialize',
          id: 'init-1',
          params: { protocolVersion: '2025-06-18', clientInfo: { name: 'test-client', version: '1.0.0' } },
        },
        {},
      );

      await transport.send?.({
        jsonrpc: '2.0',
        id: 'init-1',
        result: {
          protocolVersion: '2025-06-18',
          serverInfo: { name: 'test-server', version: '2.0.0' },
          capabilities: {},
        },
      });

      expect(mockSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          'mcp.server.name': 'test-server',
          'mcp.server.version': '2.0.0',
        }),
      );
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('adds modern protocol and client info to request spans', async () => {
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      const transport = createMockTransport();
      transport.sessionId = '';

      await wrappedMcpServer.connect(transport);

      transport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          id: 'modern-tool-call',
          params: {
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientInfo': { name: 'modern-client', version: '2.0.0' },
              'io.modelcontextprotocol/clientCapabilities': {
                roots: {},
                extensions: { 'com.example/approval': {} },
              },
            },
            name: 'weather',
          },
        },
        { classification: { era: 'modern', revision: '2026-07-28' } },
      );

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'mcp.client.name': 'modern-client',
            'mcp.client.version': '2.0.0',
            'mcp.client.capabilities': ['roots'],
            'mcp.client.extension_ids': ['com.example/approval'],
            'mcp.protocol.version': '2026-07-28',
          }),
        }),
      );
    });

    it('ignores legacy session fields outside initialize messages', async () => {
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      const transport = createMockTransport();
      transport.sessionId = '';
      const mockSpan = { setAttributes: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(mockSpan as any);

      await wrappedMcpServer.connect(transport);

      transport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'custom/process',
          id: 'custom-request',
          params: {
            protocolVersion: 'application-version',
            clientInfo: { name: 'application-client', version: '1.0.0' },
          },
        },
        {},
      );
      await transport.send?.({
        jsonrpc: '2.0',
        id: 'custom-request',
        result: {
          protocolVersion: 'application-version',
          serverInfo: { name: 'application-server', version: '1.0.0' },
        },
      });

      expect(getSessionDataForTransport(transport)).toBeUndefined();
      expect(mockSpan.setAttributes).not.toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalledOnce();
    });

    it('uses transport classification for the protocol version of modern notification spans', async () => {
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      const transport = createMockTransport();
      transport.sessionId = '';

      await wrappedMcpServer.connect(transport);

      transport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'notifications/tools/list_changed',
          params: {},
        },
        { classification: { era: 'modern', revision: '2026-07-28' } },
      );

      expect(startSpanSpy).toHaveBeenCalledWith(
        {
          name: 'notifications/tools/list_changed',
          attributes: {
            'mcp.transport': 'StreamableHTTPServerTransport',
            'network.transport': 'tcp',
            'network.protocol.name': 'http',
            'mcp.protocol.version': '2026-07-28',
            'mcp.method.name': 'notifications/tools/list_changed',
            'sentry.kind': 'server',
            'sentry.op': 'mcp.notification.client_to_server',
            'sentry.origin': 'auto.mcp.notification',
          },
        },
        expect.any(Function),
      );
    });

    it('adds modern server info to completed request spans', async () => {
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      const transport = createMockTransport();
      transport.sessionId = '';
      const mockSpan = { setAttributes: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(mockSpan as any);

      await wrappedMcpServer.connect(transport);

      transport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          id: 'modern-tool-call',
          params: {
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientInfo': { name: 'modern-client', version: '2.0.0' },
            },
            name: 'weather',
          },
        },
        { classification: { era: 'modern', revision: '2026-07-28' } },
      );
      await transport.send?.({
        jsonrpc: '2.0',
        id: 'modern-tool-call',
        result: {
          resultType: 'complete',
          content: [{ type: 'text', text: 'Sunny' }],
          _meta: {
            'io.modelcontextprotocol/serverInfo': { name: 'modern-server', version: '2.0.0' },
          },
        },
      });

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'mcp.server.name': 'modern-server',
        'mcp.server.version': '2.0.0',
      });
      expect(mockSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          'gen_ai.tool.call.result': '{"content":[{"type":"text","text":"Sunny"}]}',
          'mcp.result.type': 'complete',
          'mcp.tool.result.content_count': 1,
        }),
      );
      expect(mockSpan.end).toHaveBeenCalledOnce();
    });
  });

  describe('Wrapper Options', () => {
    it('should NOT capture inputs/outputs when dataCollection.genAI.inputs/outputs are false', async () => {
      getClientSpy.mockReturnValue(createMockClient(false));

      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      const transport = createMockTransport();

      await wrappedMcpServer.connect(transport);

      transport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          id: 'tool-1',
          params: { name: 'weather', arguments: { location: 'London' } },
        },
        {},
      );

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.not.objectContaining({
            'mcp.request.argument.location': expect.anything(),
          }),
        }),
      );
    });

    it('should capture inputs/outputs when dataCollection.genAI.inputs/outputs are true', async () => {
      getClientSpy.mockReturnValue(createMockClient(true));

      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      const transport = createMockTransport();

      await wrappedMcpServer.connect(transport);

      transport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          id: 'tool-1',
          params: { name: 'weather', arguments: { location: 'London' } },
        },
        {},
      );

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'mcp.request.argument.location': '"London"',
          }),
        }),
      );
    });

    it.each([
      [false, false],
      [true, true],
    ])('captures tool-result URIs only when userInfo=%s', async (userInfo, shouldCaptureUri) => {
      getClientSpy.mockReturnValue(createMockClient(userInfo, { inputs: true, outputs: true }));
      const mockSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(mockSpan as any);
      const wrappedMcpServer = wrapMcpServerWithSentry(createMockMcpServer());
      const transport = createMockTransport();
      await wrappedMcpServer.connect(transport);

      transport.onmessage?.(
        { jsonrpc: '2.0', method: 'tools/call', id: 'uri-result', params: { name: 'read-secret' } },
        {},
      );
      await transport.send?.({
        jsonrpc: '2.0',
        id: 'uri-result',
        result: { content: [{ type: 'resource_link', uri: 'file:///private/secret.txt' }] },
      });

      const uriAttributes = expect.objectContaining({
        'gen_ai.tool.call.result': expect.stringContaining('file:///private/secret.txt'),
        'mcp.tool.result.uri': 'file:///private/secret.txt',
      });
      if (shouldCaptureUri) {
        expect(mockSpan.setAttributes).toHaveBeenCalledWith(uriAttributes);
      } else {
        expect(mockSpan.setAttributes).toHaveBeenCalledWith(
          expect.objectContaining({
            'gen_ai.tool.call.result': '{"content":[{"type":"resource_link"}]}',
          }),
        );
        expect(mockSpan.setAttributes).not.toHaveBeenCalledWith(
          expect.objectContaining({ 'mcp.tool.result.uri': expect.anything() }),
        );
        expect(mockSpan.setAttributes).toHaveBeenCalledWith(
          expect.objectContaining({ 'mcp.tool.result.content_count': 1 }),
        );
      }
    });

    it('should allow explicit override of defaults', async () => {
      getClientSpy.mockReturnValue(createMockClient(true));

      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer, { recordInputs: false });
      const transport = createMockTransport();

      await wrappedMcpServer.connect(transport);

      transport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          id: 'tool-1',
          params: { name: 'weather', arguments: { location: 'London' } },
        },
        {},
      );

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.not.objectContaining({
            'mcp.request.argument.location': expect.anything(),
          }),
        }),
      );
    });
  });

  describe('Wrapper Transport Pattern (NodeStreamableHTTPServerTransport)', () => {
    /**
     * Tests for the wrapper transport pattern used by NodeStreamableHTTPServerTransport.
     *
     * NodeStreamableHTTPServerTransport wraps WebStandardStreamableHTTPServerTransport
     * and proxies onmessage/onclose via getters/setters. This causes Sentry's instrumentation
     * to see different `this` values in onmessage (inner transport) vs send (outer transport).
     *
     * Instrumentation captures the outer transport identity while the proxied handler can run
     * with the inner transport as `this`.
     *
     * @see https://github.com/getsentry/sentry-mcp/issues/767
     */

    it('should correlate spans correctly when using wrapper transport pattern', async () => {
      const { wrapper } = createMockWrapperTransport('wrapper-test-session');
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

      // Connect using the wrapper transport (what users do)
      await wrappedMcpServer.connect(wrapper);

      const mockSpan = { setAttributes: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(mockSpan as any);

      // Simulate incoming request - due to getter/setter, onmessage runs on inner transport
      // but we call it via the wrapper's property access
      wrapper.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          id: 'wrapper-req-1',
          params: { name: 'test-tool' },
        },
        {},
      );

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tools/call test-tool',
          op: 'mcp.server',
        }),
      );

      // Simulate outgoing response - send is called on wrapper, but the bug was that
      // it couldn't find the span because `this` was different from onmessage's `this`
      await wrapper.send({
        jsonrpc: '2.0',
        id: 'wrapper-req-1',
        result: { content: [{ type: 'text', text: 'success' }] },
      });

      // The span should be completed (this was broken before the fix)
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('isolates request correlation for transports that reuse the same session id', async () => {
      const firstTransport = createMockTransport();
      const secondTransport = createMockTransport();
      firstTransport.sessionId = 'shared-session-id';
      secondTransport.sessionId = 'shared-session-id';
      const firstServer = wrapMcpServerWithSentry(createMockMcpServer());
      const secondServer = wrapMcpServerWithSentry(createMockMcpServer());
      const firstSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      const secondSpan = { setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValueOnce(firstSpan as any).mockReturnValueOnce(secondSpan as any);
      await firstServer.connect(firstTransport);
      await secondServer.connect(secondTransport);

      firstTransport.onmessage?.({ jsonrpc: '2.0', method: 'tools/list', id: 'same-request-id' }, {});
      secondTransport.onmessage?.({ jsonrpc: '2.0', method: 'tools/list', id: 'same-request-id' }, {});

      await firstTransport.send?.({ jsonrpc: '2.0', id: 'same-request-id', result: { tools: [] } });
      expect(firstSpan.end).toHaveBeenCalledOnce();
      expect(secondSpan.end).not.toHaveBeenCalled();

      await secondTransport.send?.({ jsonrpc: '2.0', id: 'same-request-id', result: { tools: [] } });
      expect(secondSpan.end).toHaveBeenCalledOnce();
    });

    it('should correlate spans correctly for stateless wrapper transports', async () => {
      const { wrapper, inner } = createMockWrapperTransport('stateless-wrapper-session');
      inner.sessionId = undefined;

      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

      await wrappedMcpServer.connect(wrapper);

      const mockSpan = { setAttributes: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(mockSpan as any);

      inner.onmessage?.call(
        inner,
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          id: 'stateless-wrapper-req-1',
          params: { name: 'test-tool' },
        },
        {},
      );

      await wrapper.send({
        jsonrpc: '2.0',
        id: 'stateless-wrapper-req-1',
        result: { content: [{ type: 'text', text: 'success' }] },
      });

      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should preserve session metadata for later stateless wrapper spans', async () => {
      const { wrapper, inner } = createMockWrapperTransport('stateless-wrapper-session');
      inner.sessionId = undefined;

      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

      await wrappedMcpServer.connect(wrapper);

      inner.onmessage?.call(
        inner,
        {
          jsonrpc: '2.0',
          method: 'initialize',
          id: 'init-stateless',
          params: {
            protocolVersion: '2025-06-18',
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        },
        {},
      );

      await wrapper.send({
        jsonrpc: '2.0',
        id: 'init-stateless',
        result: {
          protocolVersion: '2025-06-18',
          serverInfo: { name: 'test-server', version: '2.0.0' },
          capabilities: {},
        },
      });

      inner.onmessage?.call(
        inner,
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          id: 'stateless-wrapper-req-2',
          params: { name: 'test-tool' },
        },
        {},
      );

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'mcp.client.name': 'test-client',
            'mcp.client.version': '1.0.0',
            'mcp.protocol.version': '2025-06-18',
            'mcp.server.name': 'test-server',
            'mcp.server.version': '2.0.0',
          }),
        }),
      );
    });

    it('should handle initialize request/response with wrapper transport', async () => {
      const { wrapper } = createMockWrapperTransport('init-wrapper-session');
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

      await wrappedMcpServer.connect(wrapper);

      const mockSpan = { setAttributes: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(mockSpan as any);

      // Initialize request
      wrapper.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'initialize',
          id: 'init-1',
          params: {
            protocolVersion: '2025-06-18',
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        },
        {},
      );

      // Initialize response
      await wrapper.send({
        jsonrpc: '2.0',
        id: 'init-1',
        result: {
          protocolVersion: '2025-06-18',
          serverInfo: { name: 'test-server', version: '2.0.0' },
          capabilities: {},
        },
      });

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'mcp.client.name': 'test-client',
            'mcp.client.version': '1.0.0',
          }),
        }),
      );
      expect(mockSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          'mcp.server.name': 'test-server',
          'mcp.server.version': '2.0.0',
        }),
      );
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should cleanup spans on close with wrapper transport', async () => {
      const { wrapper } = createMockWrapperTransport('cleanup-wrapper-session');
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

      await wrappedMcpServer.connect(wrapper);

      const mockSpan = { setAttributes: vi.fn(), end: vi.fn(), setStatus: vi.fn() };
      startInactiveSpanSpy.mockReturnValue(mockSpan as any);

      // Start a request but don't complete it
      wrapper.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          id: 'uncompleted-req',
          params: { name: 'slow-tool' },
        },
        {},
      );

      // Close the transport (should cleanup pending spans)
      wrapper.onclose?.();
      await new Promise(resolve => setTimeout(resolve));

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'mcp.request.outcome': 'cancelled',
      });
      expect(mockSpan.setStatus).not.toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should preserve the wrapper session id for span attributes', () => {
      const { wrapper, inner } = createMockWrapperTransport('shared-session-test');

      expect(wrapper.sessionId).toBe(inner.sessionId);
      expect(wrapper.sessionId).toBe('shared-session-test');
    });
  });
});
