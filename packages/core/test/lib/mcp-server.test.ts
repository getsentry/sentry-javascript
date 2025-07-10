import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as currentScopes from '../../src/currentScopes';
import { wrapMcpServerWithSentry } from '../../src/integrations/mcp-server';
import { filterMcpPiiFromSpanData } from '../../src/integrations/mcp-server/piiFiltering';
import * as tracingModule from '../../src/tracing';

describe('wrapMcpServerWithSentry', () => {
  const startSpanSpy = vi.spyOn(tracingModule, 'startSpan');
  const startInactiveSpanSpy = vi.spyOn(tracingModule, 'startInactiveSpan');
  const getClientSpy = vi.spyOn(currentScopes, 'getClient');

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock client to return sendDefaultPii: true for instrumentation tests
    getClientSpy.mockReturnValue({
      getOptions: () => ({ sendDefaultPii: true }),
      getDsn: () => ({ publicKey: 'test-key', host: 'test-host' }),
      emit: vi.fn(),
    } as any);
  });

  it('should return the same instance (modified) if it is a valid MCP server instance', () => {
    const mockMcpServer = createMockMcpServer();
    const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

    expect(wrappedMcpServer).toBe(mockMcpServer);
  });

  it('should return the input unchanged if it is not a valid MCP server instance', () => {
    const invalidMcpServer = {
      resource: () => {},
      tool: () => {},
      // Missing required methods
    };

    const result = wrapMcpServerWithSentry(invalidMcpServer);
    expect(result).toBe(invalidMcpServer);

    // Methods should not be wrapped
    expect(result.resource).toBe(invalidMcpServer.resource);
    expect(result.tool).toBe(invalidMcpServer.tool);

    // No calls to startSpan or startInactiveSpan
    expect(startSpanSpy).not.toHaveBeenCalled();
    expect(startInactiveSpanSpy).not.toHaveBeenCalled();
  });

  it('should not wrap the same instance twice', () => {
    const mockMcpServer = createMockMcpServer();

    const wrappedOnce = wrapMcpServerWithSentry(mockMcpServer);
    const wrappedTwice = wrapMcpServerWithSentry(wrappedOnce);

    expect(wrappedTwice).toBe(wrappedOnce);
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
          forceTransaction: true,
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
          forceTransaction: true,
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
          forceTransaction: true,
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
  });

  describe('Span Creation & Semantic Conventions', () => {
    let mockMcpServer: ReturnType<typeof createMockMcpServer>;
    let wrappedMcpServer: ReturnType<typeof createMockMcpServer>;
    let mockTransport: ReturnType<typeof createMockTransport>;

    beforeEach(() => {
      mockMcpServer = createMockMcpServer();
      wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      mockTransport = createMockTransport();
      mockTransport.sessionId = 'test-session-123';
      // Don't connect here - let individual tests control when connection happens
    });

    it('should create spans with correct MCP server semantic attributes for tool operations', async () => {
      await wrappedMcpServer.connect(mockTransport);

      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'req-1',
        params: { name: 'get-weather', arguments: { location: 'Seattle, WA' } },
      };

      const extraWithClientInfo = {
        requestInfo: {
          remoteAddress: '192.168.1.100',
          remotePort: 54321,
        },
      };

      mockTransport.onmessage?.(jsonRpcRequest, extraWithClientInfo);

      expect(startInactiveSpanSpy).toHaveBeenCalledWith({
        name: 'tools/call get-weather',
        op: 'mcp.server',
        forceTransaction: true,
        attributes: {
          'mcp.method.name': 'tools/call',
          'mcp.tool.name': 'get-weather',
          'mcp.request.id': 'req-1',
          'mcp.session.id': 'test-session-123',
          'client.address': '192.168.1.100',
          'client.port': 54321,
          'mcp.transport': 'http',
          'network.transport': 'tcp',
          'network.protocol.version': '2.0',
          'mcp.request.argument.location': '"Seattle, WA"',
          'sentry.op': 'mcp.server',
          'sentry.origin': 'auto.function.mcp_server',
          'sentry.source': 'route',
        },
      });
    });

    it('should create spans with correct attributes for resource operations', async () => {
      await wrappedMcpServer.connect(mockTransport);

      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'resources/read',
        id: 'req-2',
        params: { uri: 'file:///docs/api.md' },
      };

      mockTransport.onmessage?.(jsonRpcRequest, {});

      expect(startInactiveSpanSpy).toHaveBeenCalledWith({
        name: 'resources/read file:///docs/api.md',
        op: 'mcp.server',
        forceTransaction: true,
        attributes: {
          'mcp.method.name': 'resources/read',
          'mcp.resource.uri': 'file:///docs/api.md',
          'mcp.request.id': 'req-2',
          'mcp.session.id': 'test-session-123',
          'mcp.transport': 'http',
          'network.transport': 'tcp',
          'network.protocol.version': '2.0',
          'mcp.request.argument.uri': '"file:///docs/api.md"',
          'sentry.op': 'mcp.server',
          'sentry.origin': 'auto.function.mcp_server',
          'sentry.source': 'route',
        },
      });
    });

    it('should create spans with correct attributes for prompt operations', async () => {
      await wrappedMcpServer.connect(mockTransport);

      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'prompts/get',
        id: 'req-3',
        params: { name: 'analyze-code' },
      };

      mockTransport.onmessage?.(jsonRpcRequest, {});

      expect(startInactiveSpanSpy).toHaveBeenCalledWith({
        name: 'prompts/get analyze-code',
        op: 'mcp.server',
        forceTransaction: true,
        attributes: {
          'mcp.method.name': 'prompts/get',
          'mcp.prompt.name': 'analyze-code',
          'mcp.request.id': 'req-3',
          'mcp.session.id': 'test-session-123',
          'mcp.transport': 'http',
          'network.transport': 'tcp',
          'network.protocol.version': '2.0',
          'mcp.request.argument.name': '"analyze-code"',
          'sentry.op': 'mcp.server',
          'sentry.origin': 'auto.function.mcp_server',
          'sentry.source': 'route',
        },
      });
    });

    it('should create spans with correct attributes for notifications (no request id)', async () => {
      await wrappedMcpServer.connect(mockTransport);

      const jsonRpcNotification = {
        jsonrpc: '2.0',
        method: 'notifications/tools/list_changed',
        params: {},
      };

      mockTransport.onmessage?.(jsonRpcNotification, {});

      expect(startSpanSpy).toHaveBeenCalledWith(
        {
          name: 'notifications/tools/list_changed',
          forceTransaction: true,
          attributes: {
            'mcp.method.name': 'notifications/tools/list_changed',
            'mcp.session.id': 'test-session-123',
            'mcp.transport': 'http',
            'network.transport': 'tcp',
            'network.protocol.version': '2.0',
            'sentry.op': 'mcp.notification.client_to_server',
            'sentry.origin': 'auto.mcp.notification',
            'sentry.source': 'route',
          },
        },
        expect.any(Function),
      );

      // Should not include mcp.request.id for notifications
      const callArgs = vi.mocked(tracingModule.startSpan).mock.calls[0];
      expect(callArgs).toBeDefined();
      const attributes = callArgs?.[0]?.attributes;
      expect(attributes).not.toHaveProperty('mcp.request.id');
    });

    it('should create spans for list operations without target in name', async () => {
      await wrappedMcpServer.connect(mockTransport);

      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'req-4',
        params: {},
      };

      mockTransport.onmessage?.(jsonRpcRequest, {});

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tools/list',
          forceTransaction: true,
          attributes: expect.objectContaining({
            'mcp.method.name': 'tools/list',
            'mcp.request.id': 'req-4',
            'mcp.session.id': 'test-session-123',
            // Transport attributes
            'mcp.transport': 'http',
            'network.transport': 'tcp',
            'network.protocol.version': '2.0',
            // Sentry-specific
            'sentry.op': 'mcp.server',
            'sentry.origin': 'auto.function.mcp_server',
            'sentry.source': 'route',
          }),
        }),
      );
    });

    it('should create spans with logging attributes for notifications/message', async () => {
      await wrappedMcpServer.connect(mockTransport);

      const loggingNotification = {
        jsonrpc: '2.0',
        method: 'notifications/message',
        params: {
          level: 'info',
          logger: 'math-service',
          data: 'Addition completed: 2 + 5 = 7',
        },
      };

      mockTransport.onmessage?.(loggingNotification, {});

      expect(startSpanSpy).toHaveBeenCalledWith(
        {
          name: 'notifications/message',
          forceTransaction: true,
          attributes: {
            'mcp.method.name': 'notifications/message',
            'mcp.session.id': 'test-session-123',
            'mcp.transport': 'http',
            'network.transport': 'tcp',
            'network.protocol.version': '2.0',
            'mcp.logging.level': 'info',
            'mcp.logging.logger': 'math-service',
            'mcp.logging.data_type': 'string',
            'mcp.logging.message': 'Addition completed: 2 + 5 = 7',
            'sentry.op': 'mcp.notification.client_to_server',
            'sentry.origin': 'auto.mcp.notification',
            'sentry.source': 'route',
          },
        },
        expect.any(Function),
      );
    });

    it('should create spans with attributes for other notification types', async () => {
      await wrappedMcpServer.connect(mockTransport);

      // Test notifications/cancelled
      const cancelledNotification = {
        jsonrpc: '2.0',
        method: 'notifications/cancelled',
        params: {
          requestId: 'req-123',
          reason: 'user_requested',
        },
      };

      mockTransport.onmessage?.(cancelledNotification, {});

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'notifications/cancelled',
          attributes: expect.objectContaining({
            'mcp.method.name': 'notifications/cancelled',
            'mcp.cancelled.request_id': 'req-123',
            'mcp.cancelled.reason': 'user_requested',
            'sentry.op': 'mcp.notification.client_to_server',
            'sentry.origin': 'auto.mcp.notification',
            'sentry.source': 'route',
          }),
        }),
        expect.any(Function),
      );

      vi.clearAllMocks();

      // Test notifications/progress
      const progressNotification = {
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: {
          progressToken: 'token-456',
          progress: 75,
          total: 100,
          message: 'Processing files...',
        },
      };

      mockTransport.onmessage?.(progressNotification, {});

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'notifications/progress',
          attributes: expect.objectContaining({
            'mcp.method.name': 'notifications/progress',
            'mcp.progress.token': 'token-456',
            'mcp.progress.current': 75,
            'mcp.progress.total': 100,
            'mcp.progress.percentage': 75,
            'mcp.progress.message': 'Processing files...',
            'sentry.op': 'mcp.notification.client_to_server',
            'sentry.origin': 'auto.mcp.notification',
            'sentry.source': 'route',
          }),
        }),
        expect.any(Function),
      );

      vi.clearAllMocks();

      // Test notifications/resources/updated
      const resourceUpdatedNotification = {
        jsonrpc: '2.0',
        method: 'notifications/resources/updated',
        params: {
          uri: 'file:///tmp/data.json',
        },
      };

      mockTransport.onmessage?.(resourceUpdatedNotification, {});

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'notifications/resources/updated',
          attributes: expect.objectContaining({
            'mcp.method.name': 'notifications/resources/updated',
            'mcp.resource.uri': 'file:///tmp/data.json',
            'mcp.resource.protocol': 'file',
            'sentry.op': 'mcp.notification.client_to_server',
            'sentry.origin': 'auto.mcp.notification',
            'sentry.source': 'route',
          }),
        }),
        expect.any(Function),
      );
    });

    it('should create spans with correct operation for outgoing notifications', async () => {
      await wrappedMcpServer.connect(mockTransport);

      const outgoingNotification = {
        jsonrpc: '2.0',
        method: 'notifications/tools/list_changed',
      };

      await mockTransport.send?.(outgoingNotification);

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'notifications/tools/list_changed',
          attributes: expect.objectContaining({
            'mcp.method.name': 'notifications/tools/list_changed',
            'sentry.op': 'mcp.notification.server_to_client',
            'sentry.origin': 'auto.mcp.notification',
            'sentry.source': 'route',
          }),
        }),
        expect.any(Function),
      );
    });

    it('should instrument tool call results and complete span with enriched attributes', async () => {
      await wrappedMcpServer.connect(mockTransport);

      const mockSpan = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      };
      startInactiveSpanSpy.mockReturnValueOnce(mockSpan);

      const toolCallRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'req-tool-result',
        params: {
          name: 'weather-lookup',
          arguments: { location: 'San Francisco', units: 'celsius' },
        },
      };

      // Simulate the incoming tool call request
      mockTransport.onmessage?.(toolCallRequest, {});

      // Verify span was created for the request
      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tools/call weather-lookup',
          op: 'mcp.server',
          forceTransaction: true,
          attributes: expect.objectContaining({
            'mcp.method.name': 'tools/call',
            'mcp.tool.name': 'weather-lookup',
            'mcp.request.id': 'req-tool-result',
          }),
        }),
      );

      // Simulate tool execution response with results
      const toolResponse = {
        jsonrpc: '2.0',
        id: 'req-tool-result',
        result: {
          content: [
            {
              type: 'text',
              text: 'The weather in San Francisco is 18°C with partly cloudy skies.',
            },
          ],
          isError: false,
        },
      };

      // Simulate the outgoing response (this should trigger span completion)
      mockTransport.send?.(toolResponse);

      // Verify that the span was enriched with tool result attributes
      expect(mockSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          'mcp.tool.result.is_error': false,
          'mcp.tool.result.content_count': 1,
          'mcp.tool.result.content':
            '[{"type":"text","text":"The weather in San Francisco is 18°C with partly cloudy skies."}]',
        }),
      );

      // Verify span was completed successfully (no error status set)
      expect(mockSpan.setStatus).not.toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });

  describe('Stdio Transport Tests', () => {
    let mockMcpServer: ReturnType<typeof createMockMcpServer>;
    let wrappedMcpServer: ReturnType<typeof createMockMcpServer>;
    let mockStdioTransport: ReturnType<typeof createMockStdioTransport>;

    beforeEach(() => {
      mockMcpServer = createMockMcpServer();
      wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
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
        forceTransaction: true,
        attributes: {
          'mcp.method.name': 'tools/call',
          'mcp.tool.name': 'process-file',
          'mcp.request.id': 'req-stdio-1',
          'mcp.session.id': 'stdio-session-456',
          'mcp.transport': 'stdio', // Should be stdio, not http
          'network.transport': 'pipe', // Should be pipe, not tcp
          'network.protocol.version': '2.0',
          'mcp.request.argument.path': '"/tmp/data.txt"',
          'sentry.op': 'mcp.server',
          'sentry.origin': 'auto.function.mcp_server',
          'sentry.source': 'route',
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
            'mcp.transport': 'stdio',
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
          name: 'resources/read https://api.example.com/data',
          attributes: expect.objectContaining({
            'mcp.method.name': 'resources/read',
            'mcp.resource.uri': 'https://api.example.com/data',
            'mcp.transport': 'sse', // Deprecated but supported
            'network.transport': 'tcp',
            'mcp.session.id': 'sse-session-789',
          }),
        }),
      );
    });
  });

  describe('PII Filtering', () => {
    let mockMcpServer: ReturnType<typeof createMockMcpServer>;
    let wrappedMcpServer: ReturnType<typeof createMockMcpServer>;
    let mockTransport: ReturnType<typeof createMockTransport>;

    beforeEach(() => {
      mockMcpServer = createMockMcpServer();
      wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      mockTransport = createMockTransport();
      mockTransport.sessionId = 'test-session-123';
    });

    it('should include PII data when sendDefaultPii is true', async () => {
      // Mock client with sendDefaultPii: true
      getClientSpy.mockReturnValue({
        getOptions: () => ({ sendDefaultPii: true }),
        getDsn: () => ({ publicKey: 'test-key', host: 'test-host' }),
        emit: vi.fn(),
      } as any);

      await wrappedMcpServer.connect(mockTransport);

      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'req-pii-true',
        params: { name: 'weather', arguments: { location: 'London', units: 'metric' } },
      };

      const extraWithClientInfo = {
        requestInfo: {
          remoteAddress: '192.168.1.100',
          remotePort: 54321,
        },
      };

      mockTransport.onmessage?.(jsonRpcRequest, extraWithClientInfo);

      expect(startInactiveSpanSpy).toHaveBeenCalledWith({
        name: 'tools/call weather',
        op: 'mcp.server',
        forceTransaction: true,
        attributes: expect.objectContaining({
          'client.address': '192.168.1.100',
          'client.port': 54321,
          'mcp.request.argument.location': '"London"',
          'mcp.request.argument.units': '"metric"',
          'mcp.tool.name': 'weather',
        }),
      });
    });

    it('should exclude PII data when sendDefaultPii is false', async () => {
      // Mock client with sendDefaultPii: false
      getClientSpy.mockReturnValue({
        getOptions: () => ({ sendDefaultPii: false }),
        getDsn: () => ({ publicKey: 'test-key', host: 'test-host' }),
        emit: vi.fn(),
      } as any);

      await wrappedMcpServer.connect(mockTransport);

      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'req-pii-false',
        params: { name: 'weather', arguments: { location: 'London', units: 'metric' } },
      };

      const extraWithClientInfo = {
        requestInfo: {
          remoteAddress: '192.168.1.100',
          remotePort: 54321,
        },
      };

      mockTransport.onmessage?.(jsonRpcRequest, extraWithClientInfo);

      const callArgs = startInactiveSpanSpy.mock.calls[0][0];

      // PII data should be filtered out
      expect(callArgs.attributes).not.toHaveProperty('client.address');
      expect(callArgs.attributes).not.toHaveProperty('client.port');
      expect(callArgs.attributes).not.toHaveProperty('mcp.request.argument.location');
      expect(callArgs.attributes).not.toHaveProperty('mcp.request.argument.units');

      // Non-PII data should remain
      expect(callArgs.attributes).toHaveProperty('mcp.tool.name', 'weather');
      expect(callArgs.attributes).toHaveProperty('mcp.method.name', 'tools/call');
    });

    it('should filter tool result content when sendDefaultPii is false', async () => {
      // Mock client with sendDefaultPii: false
      getClientSpy.mockReturnValue({
        getOptions: () => ({ sendDefaultPii: false }),
      } as any);

      await wrappedMcpServer.connect(mockTransport);

      const mockSpan = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      };
      startInactiveSpanSpy.mockReturnValueOnce(mockSpan);

      const toolCallRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'req-tool-result-filtered',
        params: { name: 'weather-lookup' },
      };

      mockTransport.onmessage?.(toolCallRequest, {});

      const toolResponse = {
        jsonrpc: '2.0',
        id: 'req-tool-result-filtered',
        result: {
          content: [{ type: 'text', text: 'Sensitive weather data for London' }],
          isError: false,
        },
      };

      mockTransport.send?.(toolResponse);

      // Tool result content should be filtered out
      const setAttributesCall = mockSpan.setAttributes.mock.calls[0][0];
      expect(setAttributesCall).not.toHaveProperty('mcp.tool.result.content');
      expect(setAttributesCall).toHaveProperty('mcp.tool.result.is_error', false);
      expect(setAttributesCall).toHaveProperty('mcp.tool.result.content_count', 1);
    });
  });

  describe('PII Filtering Function', () => {
    it('should preserve all data when sendDefaultPii is true', () => {
      const spanData = {
        'client.address': '192.168.1.100',
        'client.port': 54321,
        'mcp.request.argument.location': '"San Francisco"',
        'mcp.tool.result.content': 'Weather data: 18°C',
        'mcp.logging.message': 'User requested weather',
        'mcp.resource.uri': 'file:///private/docs/secret.txt',
        'mcp.method.name': 'tools/call', // Non-PII should remain
      };

      const result = filterMcpPiiFromSpanData(spanData, true);

      expect(result).toEqual(spanData); // All data preserved
    });

    it('should remove PII data when sendDefaultPii is false', () => {
      const spanData = {
        'client.address': '192.168.1.100',
        'client.port': 54321,
        'mcp.request.argument.location': '"San Francisco"',
        'mcp.request.argument.units': '"celsius"',
        'mcp.tool.result.content': 'Weather data: 18°C',
        'mcp.logging.message': 'User requested weather',
        'mcp.resource.uri': 'file:///private/docs/secret.txt',
        'mcp.method.name': 'tools/call', // Non-PII should remain
        'mcp.session.id': 'test-session-123', // Non-PII should remain
      };

      const result = filterMcpPiiFromSpanData(spanData, false);

      expect(result).not.toHaveProperty('client.address');
      expect(result).not.toHaveProperty('client.port');
      expect(result).not.toHaveProperty('mcp.request.argument.location');
      expect(result).not.toHaveProperty('mcp.request.argument.units');
      expect(result).not.toHaveProperty('mcp.tool.result.content');
      expect(result).not.toHaveProperty('mcp.logging.message');
      expect(result).not.toHaveProperty('mcp.resource.uri');

      expect(result).toHaveProperty('mcp.method.name', 'tools/call');
      expect(result).toHaveProperty('mcp.session.id', 'test-session-123');
    });

    it('should handle empty span data', () => {
      const result = filterMcpPiiFromSpanData({}, false);
      expect(result).toEqual({});
    });

    it('should handle span data with no PII attributes', () => {
      const spanData = {
        'mcp.method.name': 'tools/list',
        'mcp.session.id': 'test-session',
      };

      const result = filterMcpPiiFromSpanData(spanData, false);
      expect(result).toEqual(spanData);
    });
  });
});

// Test helpers
function createMockMcpServer() {
  return {
    resource: vi.fn(),
    tool: vi.fn(),
    prompt: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    server: {
      setRequestHandler: vi.fn(),
    },
  };
}

function createMockTransport() {
  // exact naming pattern from the official SDK
  class StreamableHTTPServerTransport {
    onmessage = vi.fn();
    onclose = vi.fn();
    send = vi.fn().mockResolvedValue(undefined);
    sessionId = 'test-session-123';
  }

  return new StreamableHTTPServerTransport();
}

function createMockStdioTransport() {
  // Create a mock that mimics StdioServerTransport
  // Using the exact naming pattern from the official SDK
  class StdioServerTransport {
    onmessage = vi.fn();
    onclose = vi.fn();
    send = vi.fn().mockResolvedValue(undefined);
    sessionId = 'stdio-session-456';
  }

  return new StdioServerTransport();
}

function createMockSseTransport() {
  // Create a mock that mimics the deprecated SSEServerTransport
  // For backwards compatibility testing
  class SSEServerTransport {
    onmessage = vi.fn();
    onclose = vi.fn();
    send = vi.fn().mockResolvedValue(undefined);
    sessionId = 'sse-session-789';
  }

  return new SSEServerTransport();
}
