import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as currentScopes from '../../../../src/currentScopes';
import { wrapMcpServerWithSentry } from '../../../../src/integrations/mcp-server';
import { buildTypeSpecificAttributes } from '../../../../src/integrations/mcp-server/attributeExtraction';
import { getRequestArguments } from '../../../../src/integrations/mcp-server/methodConfig';
import { getJsonRpcErrorAttributes } from '../../../../src/integrations/mcp-server/outcome';
import {
  extractCommonResultAttributes,
  extractToolResultAttributes,
} from '../../../../src/integrations/mcp-server/resultExtraction';
import * as tracingModule from '../../../../src/tracing';
import { createMockClient, createMockMcpServer, createMockTransport } from './testUtils';

describe('MCP Server Semantic Conventions', () => {
  const startSpanSpy = vi.spyOn(tracingModule, 'startSpan');
  const startInactiveSpanSpy = vi.spyOn(tracingModule, 'startInactiveSpan');
  const getClientSpy = vi.spyOn(currentScopes, 'getClient');

  beforeEach(() => {
    vi.clearAllMocks();
    getClientSpy.mockReturnValue(createMockClient(true));
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
        attributes: {
          'gen_ai.operation.name': 'execute_tool',
          'gen_ai.tool.call.arguments': '{"location":"Seattle, WA"}',
          'gen_ai.tool.name': 'get-weather',
          'jsonrpc.request.id': 'req-1',
          'mcp.method.name': 'tools/call',
          'mcp.tool.name': 'get-weather',
          'mcp.request.id': 'req-1',
          'mcp.session.id': 'test-session-123',
          'client.address': '192.168.1.100',
          'client.port': 54321,
          'mcp.transport': 'StreamableHTTPServerTransport',
          'network.transport': 'tcp',
          'network.protocol.name': 'http',
          'mcp.request.argument.location': '"Seattle, WA"',
          'sentry.kind': 'server',
          'sentry.op': 'mcp.server',
          'sentry.origin': 'auto.function.mcp_server',
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
        name: 'resources/read',
        op: 'mcp.server',
        attributes: {
          'jsonrpc.request.id': 'req-2',
          'mcp.method.name': 'resources/read',
          'mcp.resource.uri': 'file:///docs/api.md',
          'mcp.request.id': 'req-2',
          'mcp.session.id': 'test-session-123',
          'mcp.transport': 'StreamableHTTPServerTransport',
          'network.transport': 'tcp',
          'network.protocol.name': 'http',
          'mcp.request.argument.uri': '"file:///docs/api.md"',
          'sentry.kind': 'server',
          'sentry.op': 'mcp.server',
          'sentry.origin': 'auto.function.mcp_server',
        },
      });
    });

    it('bounds peer-controlled custom method names', async () => {
      await wrappedMcpServer.connect(mockTransport);
      const method = `com.example/${'m'.repeat(500)}`;
      const boundedMethod = `${method.slice(0, 253)}...`;

      mockTransport.onmessage?.({ jsonrpc: '2.0', method, id: 'custom-method' }, {});

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: boundedMethod,
          attributes: expect.objectContaining({ 'mcp.method.name': boundedMethod }),
        }),
      );
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
        attributes: {
          'gen_ai.prompt.name': 'analyze-code',
          'jsonrpc.request.id': 'req-3',
          'mcp.method.name': 'prompts/get',
          'mcp.prompt.name': 'analyze-code',
          'mcp.request.id': 'req-3',
          'mcp.session.id': 'test-session-123',
          'mcp.transport': 'StreamableHTTPServerTransport',
          'network.transport': 'tcp',
          'network.protocol.name': 'http',
          'mcp.request.argument.name': '"analyze-code"',
          'sentry.kind': 'server',
          'sentry.op': 'mcp.server',
          'sentry.origin': 'auto.function.mcp_server',
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
          attributes: {
            'mcp.method.name': 'notifications/tools/list_changed',
            'mcp.session.id': 'test-session-123',
            'mcp.transport': 'StreamableHTTPServerTransport',
            'network.transport': 'tcp',
            'network.protocol.name': 'http',
            'sentry.kind': 'server',
            'sentry.op': 'mcp.notification.client_to_server',
            'sentry.origin': 'auto.mcp.notification',
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

      expect(startInactiveSpanSpy).toHaveBeenCalledWith({
        name: 'tools/list',
        op: 'mcp.server',
        attributes: {
          'jsonrpc.request.id': 'req-4',
          'mcp.method.name': 'tools/list',
          'mcp.request.id': 'req-4',
          'mcp.session.id': 'test-session-123',
          'mcp.transport': 'StreamableHTTPServerTransport',
          'network.protocol.name': 'http',
          'network.transport': 'tcp',
          'sentry.kind': 'server',
          'sentry.op': 'mcp.server',
          'sentry.origin': 'auto.function.mcp_server',
        },
      });
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
          attributes: {
            'mcp.method.name': 'notifications/message',
            'mcp.session.id': 'test-session-123',
            'mcp.transport': 'StreamableHTTPServerTransport',
            'network.transport': 'tcp',
            'network.protocol.name': 'http',
            'mcp.logging.level': 'info',
            'mcp.logging.logger': 'math-service',
            'mcp.logging.data_type': 'string',
            'mcp.logging.message': 'Addition completed: 2 + 5 = 7',
            'sentry.kind': 'server',
            'sentry.op': 'mcp.notification.client_to_server',
            'sentry.origin': 'auto.mcp.notification',
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
            'sentry.kind': 'server',
            'sentry.op': 'mcp.notification.client_to_server',
            'sentry.origin': 'auto.mcp.notification',
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
            'mcp.progress.current': 75,
            'mcp.progress.total': 100,
            'mcp.progress.percentage': 75,
            'mcp.progress.message': 'Processing files...',
            'sentry.kind': 'server',
            'sentry.op': 'mcp.notification.client_to_server',
            'sentry.origin': 'auto.mcp.notification',
          }),
        }),
        expect.any(Function),
      );
      const progressAttributes = startSpanSpy.mock.calls[0]?.[0].attributes;
      expect(progressAttributes).not.toHaveProperty('mcp.progress.token');
      expect(JSON.stringify(progressAttributes)).not.toContain('token-456');

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
            'sentry.kind': 'server',
            'sentry.op': 'mcp.notification.client_to_server',
            'sentry.origin': 'auto.mcp.notification',
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
            'sentry.kind': 'client',
            'sentry.op': 'mcp.notification.server_to_client',
            'sentry.origin': 'auto.mcp.notification',
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
          attributes: expect.objectContaining({
            'gen_ai.operation.name': 'execute_tool',
            'gen_ai.tool.call.arguments': '{"location":"San Francisco","units":"celsius"}',
            'gen_ai.tool.name': 'weather-lookup',
            'jsonrpc.request.id': 'req-tool-result',
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
      await mockTransport.send?.(toolResponse);

      // Verify that the span was enriched with tool result attributes
      expect(setAttributesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          'gen_ai.tool.call.result':
            '{"content":[{"type":"text","text":"The weather in San Francisco is 18°C with partly cloudy skies."}]}',
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
          attributes: expect.objectContaining({
            'gen_ai.prompt.name': 'code-review',
            'gen_ai.prompt.variable.complexity': 'high',
            'gen_ai.prompt.variable.language': 'typescript',
            'jsonrpc.request.id': 'req-prompt-result',
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

      await mockTransport.send?.(promptResponse);

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

    it('should capture modern MRTR metadata without recording request state', async () => {
      await wrappedMcpServer.connect(mockTransport);

      const setAttributesSpy = vi.fn();
      const mockSpan = { setAttributes: setAttributesSpy, setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValueOnce(
        mockSpan as unknown as ReturnType<typeof tracingModule.startInactiveSpan>,
      );

      mockTransport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          id: 'req-mrtr',
          params: {
            name: 'approval',
            inputResponses: {
              first: { result: 'approved' },
              second: { result: 'denied' },
            },
            requestState: 'opaque-sensitive-state',
          },
        },
        {},
      );

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'mcp.input_response.count': 2,
            'mcp.request_state.present': true,
          }),
        }),
      );
      const requestAttributes = startInactiveSpanSpy.mock.calls[0]?.[0].attributes;
      expect(Object.values(requestAttributes ?? {})).not.toContain('opaque-sensitive-state');

      await mockTransport.send?.({
        jsonrpc: '2.0',
        id: 'req-mrtr',
        result: {
          resultType: 'input_required',
          inputRequests: {
            tool: { method: 'tools/call' },
            elicitation: { method: 'elicitation/create' },
          },
        },
      });

      expect(setAttributesSpy).toHaveBeenCalledWith({
        'mcp.input_request.count': 2,
        'mcp.input_request.methods': ['elicitation/create', 'tools/call'],
        'mcp.result.type': 'input_required',
      });
      expect(mockSpan.end).toHaveBeenCalledOnce();
    });

    it('should capture cache hints and collection size for a modern cacheable result', async () => {
      await wrappedMcpServer.connect(mockTransport);

      const setAttributesSpy = vi.fn();
      const mockSpan = { setAttributes: setAttributesSpy, setStatus: vi.fn(), end: vi.fn() };
      startInactiveSpanSpy.mockReturnValueOnce(
        mockSpan as unknown as ReturnType<typeof tracingModule.startInactiveSpan>,
      );

      mockTransport.onmessage?.({ jsonrpc: '2.0', method: 'tools/list', id: 'req-list', params: {} }, {});
      await mockTransport.send?.({
        jsonrpc: '2.0',
        id: 'req-list',
        result: {
          resultType: 'complete',
          ttlMs: 5_000,
          cacheScope: 'public',
          tools: [{ name: 'weather' }, { name: 'search' }],
        },
      });

      expect(setAttributesSpy).toHaveBeenCalledWith({
        'mcp.cache.scope': 'public',
        'mcp.cache.ttl_ms': 5_000,
        'mcp.result.count': 2,
        'mcp.result.type': 'complete',
      });
      expect(mockSpan.end).toHaveBeenCalledOnce();
    });

    it('should treat modern request metadata as request-scoped and omit legacy session identity', async () => {
      await wrappedMcpServer.connect(mockTransport);

      mockTransport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 'req-modern-metadata',
          params: {
            _meta: {
              progressToken: 'progress-123',
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientCapabilities': {},
              'io.modelcontextprotocol/logLevel': 'warning',
            },
          },
        },
        {},
      );

      const attributes = startInactiveSpanSpy.mock.calls[0]?.[0].attributes;
      expect(attributes).toMatchObject({
        'mcp.logging.requested_level': 'warning',
        'mcp.protocol.version': '2026-07-28',
      });
      expect(attributes).not.toHaveProperty('mcp.progress.token');
      expect(JSON.stringify(attributes)).not.toContain('progress-123');
      expect(attributes).not.toHaveProperty('mcp.session.id');
    });

    it('should record result request state and subscription identity without recording opaque state', () => {
      const attributes = extractCommonResultAttributes('subscriptions/listen', {
        resultType: 'input_required',
        requestState: 'opaque-sensitive-state',
        _meta: { 'io.modelcontextprotocol/subscriptionId': 42 },
      });

      expect(attributes).toEqual({
        'mcp.request_state.present': true,
        'mcp.result.type': 'input_required',
        'mcp.subscription.id': '42',
      });
      expect(Object.values(attributes)).not.toContain('opaque-sensitive-state');
    });

    it('records pagination state without recording opaque cursors', () => {
      const requestAttributes = buildTypeSpecificAttributes(
        'request',
        {
          jsonrpc: '2.0',
          id: 'paginated-request',
          method: 'tools/list',
          params: { cursor: 'opaque-sensitive-cursor' },
        },
        { cursor: 'opaque-sensitive-cursor' },
        false,
      );
      const resultAttributes = extractCommonResultAttributes('tools/list', {
        resultType: 'complete',
        nextCursor: 'opaque-sensitive-next-cursor',
        tools: [{ name: 'weather' }],
      });

      expect(requestAttributes).toEqual({
        'jsonrpc.request.id': 'paginated-request',
        'mcp.pagination.cursor.present': true,
        'mcp.request.id': 'paginated-request',
      });
      expect(resultAttributes).toEqual({
        'mcp.pagination.next_cursor.present': true,
        'mcp.result.count': 1,
        'mcp.result.type': 'complete',
      });
      expect(Object.values({ ...requestAttributes, ...resultAttributes })).not.toContain('opaque-sensitive-cursor');
      expect(Object.values({ ...requestAttributes, ...resultAttributes })).not.toContain(
        'opaque-sensitive-next-cursor',
      );
    });

    it('records bounded resource result metadata without resource content', () => {
      const attributes = extractCommonResultAttributes('resources/read', {
        resultType: 'complete',
        contents: [
          { uri: 'file:///secret/a.txt', mimeType: 'text/plain', text: 'sensitive text' },
          { uri: 'file:///secret/b.json', mimeType: 'application/json', text: '{"secret":true}' },
          { uri: 'file:///secret/c.txt', mimeType: 'text/plain', text: 'more sensitive text' },
        ],
      });

      expect(attributes).toEqual({
        'mcp.resource.result.mime_types': ['application/json', 'text/plain'],
        'mcp.result.count': 3,
        'mcp.result.type': 'complete',
      });
      expect(JSON.stringify(attributes)).not.toContain('file:///secret');
      expect(JSON.stringify(attributes)).not.toContain('sensitive text');
    });

    it('records completion shape without completion values', () => {
      const requestAttributes = buildTypeSpecificAttributes(
        'request',
        {
          jsonrpc: '2.0',
          id: 'completion-request',
          method: 'completion/complete',
          params: { ref: { type: 'ref/resource', uri: 'file:///secret/{name}' } },
        },
        { ref: { type: 'ref/resource', uri: 'file:///secret/{name}' } },
        false,
      );
      const resultAttributes = extractCommonResultAttributes('completion/complete', {
        resultType: 'complete',
        completion: {
          values: ['sensitive-first', 'sensitive-second'],
          total: 10,
          hasMore: true,
        },
      });

      expect(requestAttributes).toEqual({
        'jsonrpc.request.id': 'completion-request',
        'mcp.completion.reference.type': 'ref/resource',
        'mcp.request.id': 'completion-request',
      });
      expect(resultAttributes).toEqual({
        'mcp.result.count': 2,
        'mcp.result.has_more': true,
        'mcp.result.total_count': 10,
        'mcp.result.type': 'complete',
      });
      expect(JSON.stringify({ ...requestAttributes, ...resultAttributes })).not.toContain('file:///secret');
      expect(JSON.stringify({ ...requestAttributes, ...resultAttributes })).not.toContain('sensitive-first');
    });

    it('should encode structured tool output as a bounded OTel object JSON value', () => {
      const primitiveAttributes = extractToolResultAttributes(
        { resultType: 'complete', structuredContent: ['first', 'second'] },
        true,
      );
      const primitiveResult = primitiveAttributes['gen_ai.tool.call.result'];
      expect(typeof primitiveResult).toBe('string');
      expect(JSON.parse(primitiveResult as string)).toEqual({ structuredContent: ['first', 'second'] });

      const oversizedAttributes = extractToolResultAttributes(
        { resultType: 'complete', structuredContent: { payload: 'x'.repeat(11_000) } },
        true,
      );
      const oversizedResult = oversizedAttributes['gen_ai.tool.call.result'];
      expect(typeof oversizedResult).toBe('string');
      expect((oversizedResult as string).length).toBeLessThanOrEqual(10_000);
      expect(JSON.parse(oversizedResult as string)).toEqual({
        _sentry: { originalLength: 11_014, truncated: true },
      });
    });

    it('should only emit object-shaped canonical tool arguments and bound dynamic argument attributes', () => {
      expect(getRequestArguments('tools/call', { arguments: ['not', 'an', 'object'] })).toEqual({});

      const manyArguments = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`argument-${index}`, index]));
      const attributes = getRequestArguments('tools/call', { arguments: manyArguments });

      expect(JSON.parse(attributes['gen_ai.tool.call.arguments'] as string)).toEqual(manyArguments);
      expect(Object.keys(attributes).filter(key => key.startsWith('mcp.request.argument.'))).toHaveLength(32);
    });

    it('should classify protocol-defined caller errors according to the negotiated revision', () => {
      const error = { code: -32020, message: 'Request headers do not match request metadata' };

      expect(getJsonRpcErrorAttributes(error, '2026-07-28')).toEqual({
        'rpc.response.status_code': '-32020',
      });
      expect(getJsonRpcErrorAttributes(error, '2025-11-25')).toEqual({
        'error.type': '-32020',
        'rpc.response.status_code': '-32020',
      });
      expect(getJsonRpcErrorAttributes({ code: -32002, message: 'Resource not found' }, '2026-07-28')).toEqual({
        'error.type': '-32002',
        'rpc.response.status_code': '-32002',
      });
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
      await transport.send?.({
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
      await transport.send?.({
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

    it('never records request progress tokens when sensitive input collection is disabled', async () => {
      getClientSpy.mockReturnValue(createMockClient(false, { inputs: false, outputs: false }));
      const server = wrapMcpServerWithSentry(createMockMcpServer(), { recordInputs: false });
      const transport = createMockTransport();
      await server.connect(transport);
      const privateProgressToken = 'Bearer private-progress-token-for-customer-42';

      transport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 'private-progress-request',
          params: {
            _meta: {
              progressToken: privateProgressToken,
              'io.modelcontextprotocol/logLevel': 'warning',
            },
          },
        },
        {},
      );

      const lastCall = startInactiveSpanSpy.mock.calls[startInactiveSpanSpy.mock.calls.length - 1];
      const attributes = lastCall?.[0].attributes;
      expect(attributes).toHaveProperty('mcp.logging.requested_level', 'warning');
      expect(attributes).not.toHaveProperty('mcp.progress.token');
      expect(JSON.stringify(attributes)).not.toContain(privateProgressToken);
    });

    it('never records notification progress tokens when sensitive input collection is disabled', async () => {
      getClientSpy.mockReturnValue(createMockClient(false, { inputs: false, outputs: false }));
      const server = wrapMcpServerWithSentry(createMockMcpServer(), { recordInputs: false });
      const transport = createMockTransport();
      await server.connect(transport);
      const privateProgressToken = 'session=user-42&authorization=private-progress-token';

      transport.onmessage?.(
        {
          jsonrpc: '2.0',
          method: 'notifications/progress',
          params: {
            progressToken: privateProgressToken,
            progress: 3,
            total: 12,
            message: 'Private processing details',
          },
        },
        {},
      );

      const lastCall = startSpanSpy.mock.calls[startSpanSpy.mock.calls.length - 1];
      const attributes = lastCall?.[0].attributes;
      expect(attributes).toHaveProperty('mcp.progress.current', 3);
      expect(attributes).toHaveProperty('mcp.progress.total', 12);
      expect(attributes).toHaveProperty('mcp.progress.percentage', 25);
      expect(attributes).not.toHaveProperty('mcp.progress.token');
      expect(attributes).not.toHaveProperty('mcp.progress.message');
      expect(JSON.stringify(attributes)).not.toContain(privateProgressToken);
    });
  });
});
