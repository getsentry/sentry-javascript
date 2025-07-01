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
    it('should proxy the connect method', () => {
      const mockMcpServer = createMockMcpServer();
      const originalConnect = mockMcpServer.connect;
      
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      
      expect(wrappedMcpServer.connect).not.toBe(originalConnect);
    });

    it('should intercept transport onmessage handler', async () => {
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

      const mockTransport = createMockTransport();
      const originalOnMessage = mockTransport.onmessage;

      await wrappedMcpServer.connect(mockTransport);

      // onmessage should be wrapped
      expect(mockTransport.onmessage).not.toBe(originalOnMessage);
    });

    it('should intercept transport send handler', async () => {
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

      const mockTransport = createMockTransport();
      const originalSend = mockTransport.send;

      await wrappedMcpServer.connect(mockTransport);

      // send should be wrapped
      expect(mockTransport.send).not.toBe(originalSend);
    });

    it('should intercept transport onclose handler', async () => {
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

      const mockTransport = createMockTransport();
      const originalOnClose = mockTransport.onclose;

      await wrappedMcpServer.connect(mockTransport);

      // onclose should be wrapped
      expect(mockTransport.onclose).not.toBe(originalOnClose);
    });

    it('should call original connect and preserve functionality', async () => {
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

      const mockTransport = createMockTransport();

      await wrappedMcpServer.connect(mockTransport);

      // Original connect should have been called
      expect(mockMcpServer.connect).toHaveBeenCalledWith(mockTransport);
    });

    it('should create spans for incoming JSON-RPC requests', async () => {
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

      const mockTransport = createMockTransport();
      await wrappedMcpServer.connect(mockTransport);

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

    it('should create spans for incoming JSON-RPC notifications', async () => {
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

      const mockTransport = createMockTransport();
      await wrappedMcpServer.connect(mockTransport);

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
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

      const mockTransport = createMockTransport();
      await wrappedMcpServer.connect(mockTransport);

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

    it('should not create spans for non-JSON-RPC messages', async () => {
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

      const mockTransport = createMockTransport();
      await wrappedMcpServer.connect(mockTransport);

      // Simulate non-JSON-RPC message
      expect(mockTransport.onmessage).toBeDefined();
      mockTransport.onmessage?.({ some: 'data' }, {});

      expect(tracingModule.startSpan).not.toHaveBeenCalled();
    });

    it('should handle transport onclose events', async () => {
      const mockMcpServer = createMockMcpServer();
      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);

      const mockTransport = createMockTransport();
      mockTransport.sessionId = 'test-session-123';
      
      await wrappedMcpServer.connect(mockTransport);

      // Trigger onclose - should not throw
      expect(mockTransport.onclose).toBeDefined();
      expect(() => mockTransport.onclose?.()).not.toThrow();
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
