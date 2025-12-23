import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as currentScopes from '../../../../src/currentScopes';
import { wrapMcpServerWithSentry } from '../../../../src/integrations/mcp-server';
import {
  buildTransportAttributes,
  extractSessionDataFromInitializeRequest,
  extractSessionDataFromInitializeResponse,
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
import {
  createMockMcpServer,
  createMockSseTransport,
  createMockStdioTransport,
  createMockTransport,
} from './testUtils';

describe('MCP Server Transport Instrumentation', () => {
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
        forceTransaction: true,
        attributes: {
          'mcp.method.name': 'tools/call',
          'mcp.tool.name': 'process-file',
          'mcp.request.id': 'req-stdio-1',
          'mcp.session.id': 'stdio-session-456',
          'mcp.transport': 'StdioServerTransport',
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
          name: 'resources/read https://api.example.com/data',
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
        forceTransaction: true,
        attributes: expect.objectContaining({
          'mcp.method.name': 'tools/call',
          'mcp.tool.name': 'test-tool',
          'mcp.request.id': 'req-direct-test',
          'mcp.session.id': 'test-session-direct',
          'client.address': '127.0.0.1',
          'client.port': 8080,
          'mcp.transport': 'StreamableHTTPServerTransport',
          'network.transport': 'tcp',
          'network.protocol.version': '2.0',
          'mcp.request.argument.input': '"test"',
          'sentry.op': 'mcp.server',
          'sentry.origin': 'auto.function.mcp_server',
          'sentry.source': 'route',
        }),
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

    it('should only store data for transports with sessionId', () => {
      const transportWithoutSession = {
        onmessage: vi.fn(),
        onclose: vi.fn(),
        onerror: vi.fn(),
        send: vi.fn().mockResolvedValue(undefined),
        protocolVersion: '2025-06-18',
      };

      const sessionData = { protocolVersion: '2025-06-18' };

      storeSessionDataForTransport(transportWithoutSession, sessionData);
      expect(getSessionDataForTransport(transportWithoutSession)).toBeUndefined();
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

  describe('Initialize Span Attributes', () => {
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

      expect(mockSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          'mcp.client.name': 'test-client',
          'mcp.client.version': '1.0.0',
          'mcp.protocol.version': '2025-06-18',
        }),
      );
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
  });

  describe('Wrapper Options', () => {
    it('should NOT capture inputs/outputs when sendDefaultPii is false', async () => {
      getClientSpy.mockReturnValue({
        getOptions: () => ({ sendDefaultPii: false }),
        getDsn: () => ({ publicKey: 'test-key', host: 'test-host' }),
        emit: vi.fn(),
      } as any);

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

    it('should capture inputs/outputs when sendDefaultPii is true', async () => {
      getClientSpy.mockReturnValue({
        getOptions: () => ({ sendDefaultPii: true }),
        getDsn: () => ({ publicKey: 'test-key', host: 'test-host' }),
        emit: vi.fn(),
      } as any);

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

    it('should allow explicit override of defaults', async () => {
      getClientSpy.mockReturnValue({
        getOptions: () => ({ sendDefaultPii: true }),
        getDsn: () => ({ publicKey: 'test-key', host: 'test-host' }),
        emit: vi.fn(),
      } as any);

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
});
