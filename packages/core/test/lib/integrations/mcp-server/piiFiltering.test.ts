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

  describe('Integration Tests - Network PII', () => {
    let mockMcpServer: ReturnType<typeof createMockMcpServer>;
    let mockTransport: ReturnType<typeof createMockTransport>;

    beforeEach(() => {
      mockMcpServer = createMockMcpServer();
      mockTransport = createMockTransport();
      mockTransport.sessionId = 'test-session-123';
    });

    it('should include network PII when sendDefaultPii is true', async () => {
      getClientSpy.mockReturnValue({
        getOptions: () => ({ sendDefaultPii: true }),
        getDsn: () => ({ publicKey: 'test-key', host: 'test-host' }),
        emit: vi.fn(),
      } as unknown as ReturnType<typeof currentScopes.getClient>);

      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      await wrappedMcpServer.connect(mockTransport);

      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'req-pii-true',
        params: { name: 'weather', arguments: { location: 'London' } },
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
          attributes: expect.objectContaining({
            'client.address': '192.168.1.100',
            'client.port': 54321,
          }),
        }),
      );
    });

    it('should exclude network PII when sendDefaultPii is false', async () => {
      getClientSpy.mockReturnValue({
        getOptions: () => ({ sendDefaultPii: false }),
        getDsn: () => ({ publicKey: 'test-key', host: 'test-host' }),
        emit: vi.fn(),
      } as unknown as ReturnType<typeof currentScopes.getClient>);

      const wrappedMcpServer = wrapMcpServerWithSentry(mockMcpServer);
      await wrappedMcpServer.connect(mockTransport);

      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'req-pii-false',
        params: { name: 'weather', arguments: { location: 'London' } },
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
  });

  describe('filterMcpPiiFromSpanData Function', () => {
    it('should preserve all data when sendDefaultPii is true', () => {
      const spanData = {
        'client.address': '192.168.1.100',
        'client.port': 54321,
        'mcp.resource.uri': 'file:///private/docs/secret.txt',
        'mcp.method.name': 'tools/call',
        'mcp.tool.name': 'weather',
      };

      const result = filterMcpPiiFromSpanData(spanData, true);

      expect(result).toEqual(spanData);
    });

    it('should only remove network PII when sendDefaultPii is false', () => {
      const spanData = {
        'client.address': '192.168.1.100',
        'client.port': 54321,
        'mcp.resource.uri': 'file:///private/docs/secret.txt',
        'mcp.method.name': 'tools/call',
        'mcp.tool.name': 'weather',
        'mcp.session.id': 'test-session-123',
      };

      const result = filterMcpPiiFromSpanData(spanData, false);

      expect(result).not.toHaveProperty('client.address');
      expect(result).not.toHaveProperty('client.port');
      expect(result).not.toHaveProperty('mcp.resource.uri');

      expect(result).toHaveProperty('mcp.method.name', 'tools/call');
      expect(result).toHaveProperty('mcp.tool.name', 'weather');
      expect(result).toHaveProperty('mcp.session.id', 'test-session-123');
    });

    it('should handle empty span data', () => {
      const result = filterMcpPiiFromSpanData({}, false);
      expect(result).toEqual({});
    });

    it('should handle span data with no network PII attributes', () => {
      const spanData = {
        'mcp.method.name': 'tools/list',
        'mcp.session.id': 'test-session',
        'mcp.tool.name': 'weather',
      };

      const result = filterMcpPiiFromSpanData(spanData, false);
      expect(result).toEqual(spanData);
    });
  });
});
