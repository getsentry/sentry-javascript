import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as currentScopes from '../../../../src/currentScopes';
import { wrapMcpServerWithSentry } from '../../../../src/integrations/mcp-server';
import { filterMcpPiiFromSpanData } from '../../../../src/integrations/mcp-server/piiFiltering';
import * as tracingModule from '../../../../src/tracing';
import { createMockMcpServer, createMockTransport } from './testUtils';

describe('MCP Server PII Filtering', () => {
  const startInactiveSpanSpy = vi.spyOn(tracingModule, 'startInactiveSpan');
  const getClientSpy = vi.spyOn(currentScopes, 'getClient');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Integration Tests', () => {
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
      } as unknown as ReturnType<typeof currentScopes.getClient>);

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
      } as unknown as ReturnType<typeof currentScopes.getClient>);

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

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.not.objectContaining({
            'client.address': expect.anything(),
            'client.port': expect.anything(),
            'mcp.request.argument.location': expect.anything(),
            'mcp.request.argument.units': expect.anything(),
          }),
        }),
      );

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'mcp.tool.name': 'weather',
            'mcp.method.name': 'tools/call',
          }),
        }),
      );
    });

    it('should filter tool result content when sendDefaultPii is false', async () => {
      // Mock client with sendDefaultPii: false
      getClientSpy.mockReturnValue({
        getOptions: () => ({ sendDefaultPii: false }),
      } as ReturnType<typeof currentScopes.getClient>);

      await wrappedMcpServer.connect(mockTransport);

      const mockSpan = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      } as any;
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
      const setAttributesCall = mockSpan.setAttributes.mock.calls[0]?.[0];
      expect(setAttributesCall).toBeDefined();
      expect(setAttributesCall).not.toHaveProperty('mcp.tool.result.content');
      expect(setAttributesCall).toHaveProperty('mcp.tool.result.is_error', false);
      expect(setAttributesCall).toHaveProperty('mcp.tool.result.content_count', 1);
    });
  });

  describe('filterMcpPiiFromSpanData Function', () => {
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
