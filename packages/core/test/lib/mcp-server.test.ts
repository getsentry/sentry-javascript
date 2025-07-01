import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapMcpServerWithSentry } from '../../src/mcp-server';
import * as tracingModule from '../../src/tracing';

vi.mock('../../src/tracing');

describe('wrapMcpServerWithSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error mocking span is annoying
    vi.mocked(tracingModule.startSpan).mockImplementation((_, cb) => cb());
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

    // No calls to startSpan
    expect(tracingModule.startSpan).not.toHaveBeenCalled();
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

    beforeEach(async () => {
      mockMcpServer = createMockMcpServer();
      wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      mockTransport = createMockTransport();
      
      // Connect the server to transport - this is common to most tests
      await wrappedMcpServer.connect(mockTransport);
    });

    it('should proxy the connect method', () => {
      // We need to test this before connection, so create fresh instances
      const freshMockMcpServer = createMockMcpServer();
      const originalConnect = freshMockMcpServer.connect;
      
      const freshWrappedMcpServer = wrapMcpServerWithSentry(freshMockMcpServer);
      
      expect(freshWrappedMcpServer.connect).not.toBe(originalConnect);
    });

    it('should intercept transport onmessage handler', () => {
      const originalOnMessage = mockTransport.onmessage;
      // onmessage should be wrapped after connection
      expect(mockTransport.onmessage).not.toBe(originalOnMessage);
    });

    it('should intercept transport send handler', () => {
      const originalSend = mockTransport.send;
      // send should be wrapped after connection  
      expect(mockTransport.send).not.toBe(originalSend);
    });

    it('should intercept transport onclose handler', () => {
      const originalOnClose = mockTransport.onclose;
      // onclose should be wrapped after connection
      expect(mockTransport.onclose).not.toBe(originalOnClose);
    });

    it('should call original connect and preserve functionality', () => {
      // Original connect should have been called during beforeEach
      expect(mockMcpServer.connect).toHaveBeenCalledWith(mockTransport);
    });

    it('should create spans for incoming JSON-RPC requests', () => {
      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'req-1',
        params: { name: 'get-weather' }
      };

      // Simulate incoming message
      expect(mockTransport.onmessage).toBeDefined();
      mockTransport.onmessage?.(jsonRpcRequest, {});

      expect(tracingModule.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tools/call get-weather',
          forceTransaction: true,
        }),
        expect.any(Function)
      );
    });

    it('should create spans for incoming JSON-RPC notifications', () => {
      const jsonRpcNotification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        // No 'id' field - this makes it a notification
      };

      // Simulate incoming notification
      expect(mockTransport.onmessage).toBeDefined();
      mockTransport.onmessage?.(jsonRpcNotification, {});

      expect(tracingModule.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'notifications/initialized',
          forceTransaction: true,
        }),
        expect.any(Function)
      );
    });

    it('should create spans for outgoing notifications', async () => {
      const outgoingNotification = {
        jsonrpc: '2.0',
        method: 'notifications/tools/list_changed',
        // No 'id' field
      };

      // Simulate outgoing notification
      expect(mockTransport.send).toBeDefined();
      await mockTransport.send?.(outgoingNotification);

      expect(tracingModule.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'notifications/tools/list_changed',
          forceTransaction: true,
        }),
        expect.any(Function)
      );
    });

    it('should not create spans for non-JSON-RPC messages', () => {
      // Simulate non-JSON-RPC message
      expect(mockTransport.onmessage).toBeDefined();
      mockTransport.onmessage?.({ some: 'data' }, {});

      expect(tracingModule.startSpan).not.toHaveBeenCalled();
    });

    it('should handle transport onclose events', () => {
      mockTransport.sessionId = 'test-session-123';
      
      // Trigger onclose - should not throw
      expect(mockTransport.onclose).toBeDefined();
      expect(() => mockTransport.onclose?.()).not.toThrow();
    });
  });

  describe('Span Creation & Semantic Conventions', () => {
    let mockMcpServer: ReturnType<typeof createMockMcpServer>;
    let wrappedMcpServer: ReturnType<typeof createMockMcpServer>;
    let mockTransport: ReturnType<typeof createMockTransport>;

    beforeEach(async () => {
      mockMcpServer = createMockMcpServer();
      wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      mockTransport = createMockTransport();
      mockTransport.sessionId = 'test-session-123';
      
      await wrappedMcpServer.connect(mockTransport);
    });

    it('should create spans with correct MCP server semantic attributes for tool operations', () => {
      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'req-1',
        params: { 
          name: 'get-weather',
          arguments: { 
            location: 'Seattle, WA',
            units: 'metric'
          }
        }
      };

      const extraWithClientInfo = {
        requestInfo: {
          remoteAddress: '192.168.1.100',
          remotePort: 54321
        }
      };

      mockTransport.onmessage?.(jsonRpcRequest, extraWithClientInfo);

      expect(tracingModule.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tools/call get-weather',
          op: 'mcp.server',
          forceTransaction: true,
          attributes: expect.objectContaining({
            // Required
            'mcp.method.name': 'tools/call',
            // Conditionally Required (tool operation)
            'mcp.tool.name': 'get-weather',
            'mcp.request.id': 'req-1',
            // Recommended
            'mcp.session.id': 'test-session-123',
            'client.address': '192.168.1.100',
            'client.port': 54321,
            // Transport attributes
            'mcp.transport': 'http',
            'network.transport': 'tcp',
            'network.protocol.version': '2.0',
            // Tool arguments (JSON-stringified)
            'mcp.request.argument.location': '"Seattle, WA"',
            'mcp.request.argument.units': '"metric"',
            // Sentry-specific
            'sentry.origin': 'auto.function.mcp_server',
          }),
        }),
        expect.any(Function)
      );
    });

    it('should create spans with correct attributes for resource operations', () => {
      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'resources/read',
        id: 'req-2',
        params: { uri: 'file:///docs/api.md' }
      };

      mockTransport.onmessage?.(jsonRpcRequest, {});

      expect(tracingModule.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'resources/read file:///docs/api.md',
          op: 'mcp.server',
          attributes: expect.objectContaining({
            // Required
            'mcp.method.name': 'resources/read',
            // Conditionally Required (resource operation)
            'mcp.resource.uri': 'file:///docs/api.md',
            'mcp.request.id': 'req-2',
            // Recommended
            'mcp.session.id': 'test-session-123',
          }),
        }),
        expect.any(Function)
      );
    });

    it('should create spans with correct attributes for prompt operations', () => {
      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'prompts/get',
        id: 'req-3',
        params: { name: 'analyze-code' }
      };

      mockTransport.onmessage?.(jsonRpcRequest, {});

      expect(tracingModule.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'prompts/get analyze-code',
          op: 'mcp.server',
          attributes: expect.objectContaining({
            // Required
            'mcp.method.name': 'prompts/get',
            // Conditionally Required (prompt operation)
            'mcp.prompt.name': 'analyze-code',
            'mcp.request.id': 'req-3',
            // Recommended
            'mcp.session.id': 'test-session-123',
          }),
        }),
        expect.any(Function)
      );
    });

    it('should create spans with correct attributes for notifications (no request id)', () => {
      const jsonRpcNotification = {
        jsonrpc: '2.0',
        method: 'notifications/tools/list_changed',
        params: {}
      };

      mockTransport.onmessage?.(jsonRpcNotification, {});

      expect(tracingModule.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'notifications/tools/list_changed',
          op: 'mcp.server',
          attributes: expect.objectContaining({
            // Required
            'mcp.method.name': 'notifications/tools/list_changed',
            // Recommended
            'mcp.session.id': 'test-session-123',
            // Notification-specific
            'mcp.notification.direction': 'client_to_server',
            // Sentry-specific
            'sentry.origin': 'auto.mcp.notification',
          }),
        }),
        expect.any(Function)
      );

      // Should not include mcp.request.id for notifications
      const callArgs = vi.mocked(tracingModule.startSpan).mock.calls[0];
      expect(callArgs).toBeDefined();
      const attributes = callArgs?.[0]?.attributes;
      expect(attributes).not.toHaveProperty('mcp.request.id');
    });

    it('should create spans for list operations without target in name', () => {
      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'req-4',
        params: {}
      };

      mockTransport.onmessage?.(jsonRpcRequest, {});

      expect(tracingModule.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tools/list',
          op: 'mcp.server',
          attributes: expect.objectContaining({
            'mcp.method.name': 'tools/list',
            'mcp.request.id': 'req-4',
            'mcp.session.id': 'test-session-123',
          }),
        }),
        expect.any(Function)
      );
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
  return {
    onmessage: vi.fn(),
    onclose: vi.fn(),
    send: vi.fn().mockResolvedValue(undefined),
    sessionId: 'test-session-123',
  };
}
