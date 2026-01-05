import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as currentScopes from '../../../../src/currentScopes';
import { wrapMcpServerWithSentry } from '../../../../src/integrations/mcp-server';
import * as tracingModule from '../../../../src/tracing';
import { createMockMcpServer, createMockTransport } from './testUtils';

describe('MCP Server Semantic Conventions', () => {
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
    } as unknown as ReturnType<typeof currentScopes.getClient>);
  });

  describe('Span Creation & Semantic Conventions', () => {
    let mockMcpServer: ReturnType<typeof createMockMcpServer>;
    let wrappedMcpServer: ReturnType<typeof createMockMcpServer>;
    let mockTransport: ReturnType<typeof createMockTransport>;

    beforeEach(() => {
      mockMcpServer = createMockMcpServer();
      wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer, { recordInputs: true, recordOutputs: true });
      mockTransport = createMockTransport();
      mockTransport.sessionId = 'test-session-123';
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
          'mcp.transport': 'StreamableHTTPServerTransport',
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
          'mcp.transport': 'StreamableHTTPServerTransport',
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
          'mcp.transport': 'StreamableHTTPServerTransport',
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
            'mcp.transport': 'StreamableHTTPServerTransport',
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
      const callArgs = startSpanSpy.mock.calls[0];
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
            'mcp.transport': 'StreamableHTTPServerTransport',
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
            'mcp.transport': 'StreamableHTTPServerTransport',
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

      const setAttributesSpy = vi.fn();
      const setStatusSpy = vi.fn();
      const endSpy = vi.fn();
      const mockSpan = {
        setAttributes: setAttributesSpy,
        setStatus: setStatusSpy,
        end: endSpy,
      };
      startInactiveSpanSpy.mockReturnValueOnce(
        mockSpan as unknown as ReturnType<typeof tracingModule.startInactiveSpan>,
      );

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
      expect(setAttributesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          'mcp.tool.result.is_error': false,
          'mcp.tool.result.content_count': 1,
          'mcp.tool.result.content_type': 'text',
          'mcp.tool.result.content': 'The weather in San Francisco is 18°C with partly cloudy skies.',
        }),
      );

      // Verify span was completed successfully (no error status set)
      expect(setStatusSpy).not.toHaveBeenCalled();
      expect(endSpy).toHaveBeenCalled();
    });

    it('should instrument prompt call results and complete span with enriched attributes', async () => {
      await wrappedMcpServer.connect(mockTransport);

      const setAttributesSpy = vi.fn();
      const setStatusSpy = vi.fn();
      const endSpy = vi.fn();
      const mockSpan = {
        setAttributes: setAttributesSpy,
        setStatus: setStatusSpy,
        end: endSpy,
      };
      startInactiveSpanSpy.mockReturnValueOnce(
        mockSpan as unknown as ReturnType<typeof tracingModule.startInactiveSpan>,
      );

      const promptCallRequest = {
        jsonrpc: '2.0',
        method: 'prompts/get',
        id: 'req-prompt-result',
        params: {
          name: 'code-review',
          arguments: { language: 'typescript', complexity: 'high' },
        },
      };

      mockTransport.onmessage?.(promptCallRequest, {});

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'prompts/get code-review',
          op: 'mcp.server',
          forceTransaction: true,
          attributes: expect.objectContaining({
            'mcp.method.name': 'prompts/get',
            'mcp.prompt.name': 'code-review',
            'mcp.request.id': 'req-prompt-result',
          }),
        }),
      );

      const promptResponse = {
        jsonrpc: '2.0',
        id: 'req-prompt-result',
        result: {
          description: 'Code review prompt for TypeScript with high complexity analysis',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: 'Please review this TypeScript code for complexity and best practices.',
              },
            },
          ],
        },
      };

      mockTransport.send?.(promptResponse);

      expect(setAttributesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          'mcp.prompt.result.description': 'Code review prompt for TypeScript with high complexity analysis',
          'mcp.prompt.result.message_count': 1,
          'mcp.prompt.result.message_role': 'user',
          'mcp.prompt.result.message_content': 'Please review this TypeScript code for complexity and best practices.',
        }),
      );

      expect(setStatusSpy).not.toHaveBeenCalled();
      expect(endSpy).toHaveBeenCalled();
    });

    it('should capture tool result metadata but not content when recordOutputs is false', async () => {
      const server = wrapMcpServerWithSentry(createMockMcpServer(), { recordOutputs: false });
      const transport = createMockTransport();
      await server.connect(transport);

      const setAttributesSpy = vi.fn();
      const mockSpan = { setAttributes: setAttributesSpy, setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValueOnce(
        mockSpan as unknown as ReturnType<typeof tracingModule.startInactiveSpan>,
      );

      transport.onmessage?.({ jsonrpc: '2.0', method: 'tools/call', id: 'req-1', params: { name: 'tool' } }, {});
      transport.send?.({
        jsonrpc: '2.0',
        id: 'req-1',
        result: {
          content: [{ type: 'text', text: 'sensitive', mimeType: 'text/plain', uri: 'file:///secret', name: 'file' }],
          isError: false,
        },
      });

      const attrs = setAttributesSpy.mock.calls.find(c => c[0]?.['mcp.tool.result.content_count'])?.[0];
      expect(attrs).toMatchObject({ 'mcp.tool.result.is_error': false, 'mcp.tool.result.content_count': 1 });
      expect(attrs).not.toHaveProperty('mcp.tool.result.content');
      expect(attrs).not.toHaveProperty('mcp.tool.result.uri');
    });

    it('should capture prompt result metadata but not content when recordOutputs is false', async () => {
      const server = wrapMcpServerWithSentry(createMockMcpServer(), { recordOutputs: false });
      const transport = createMockTransport();
      await server.connect(transport);

      const setAttributesSpy = vi.fn();
      const mockSpan = { setAttributes: setAttributesSpy, setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValueOnce(
        mockSpan as unknown as ReturnType<typeof tracingModule.startInactiveSpan>,
      );

      transport.onmessage?.({ jsonrpc: '2.0', method: 'prompts/get', id: 'req-1', params: { name: 'prompt' } }, {});
      transport.send?.({
        jsonrpc: '2.0',
        id: 'req-1',
        result: {
          description: 'sensitive description',
          messages: [{ role: 'user', content: { type: 'text', text: 'sensitive' } }],
        },
      });

      const attrs = setAttributesSpy.mock.calls.find(c => c[0]?.['mcp.prompt.result.message_count'])?.[0];
      expect(attrs).toMatchObject({ 'mcp.prompt.result.message_count': 1 });
      expect(attrs).not.toHaveProperty('mcp.prompt.result.description');
      expect(attrs).not.toHaveProperty('mcp.prompt.result.message_role');
    });

    it('should capture notification metadata but not logging message when recordInputs is false', async () => {
      const server = wrapMcpServerWithSentry(createMockMcpServer(), { recordInputs: false });
      const transport = createMockTransport();
      await server.connect(transport);

      const loggingNotification = {
        jsonrpc: '2.0',
        method: 'notifications/message',
        params: { level: 'info', logger: 'test-logger', data: 'sensitive log message' },
      };

      transport.onmessage?.(loggingNotification, {});

      expect(startSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'mcp.logging.level': 'info',
            'mcp.logging.logger': 'test-logger',
            'mcp.logging.data_type': 'string',
          }),
        }),
        expect.any(Function),
      );

      const lastCall = startSpanSpy.mock.calls[startSpanSpy.mock.calls.length - 1];
      expect(lastCall?.[0]?.attributes).not.toHaveProperty('mcp.logging.message');
    });
  });
});
