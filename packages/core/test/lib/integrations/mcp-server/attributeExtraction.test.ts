import { describe, expect, it } from 'vitest';
import {
  buildTransportAttributes,
  getTransportTypes,
} from '../../../../src/integrations/mcp-server/attributeExtraction';
import type { MCPTransport } from '../../../../src/integrations/mcp-server/types';

describe('attributeExtraction edge cases', () => {
  describe('getTransportTypes', () => {
    it('handles undefined transport gracefully', () => {
      const result = getTransportTypes(undefined as any);
      expect(result).toEqual({
        mcpTransport: 'unknown',
        networkTransport: 'unknown',
      });
    });

    it('handles null transport gracefully', () => {
      const result = getTransportTypes(null as any);
      expect(result).toEqual({
        mcpTransport: 'unknown',
        networkTransport: 'unknown',
      });
    });

    it('handles transport with null constructor', () => {
      const transport = {
        constructor: null,
      } as any;
      
      const result = getTransportTypes(transport);
      expect(result).toEqual({
        mcpTransport: 'unknown',
        networkTransport: 'unknown',
      });
    });

    it('handles transport with undefined constructor', () => {
      const transport = {
        constructor: undefined,
      } as any;
      
      const result = getTransportTypes(transport);
      expect(result).toEqual({
        mcpTransport: 'unknown',
        networkTransport: 'unknown',
      });
    });

    it('correctly identifies StreamableHTTPServerTransport', () => {
      class StreamableHTTPServerTransport {
        sessionId = 'test-session';
      }
      
      const transport = new StreamableHTTPServerTransport() as MCPTransport;
      const result = getTransportTypes(transport);
      
      expect(result).toEqual({
        mcpTransport: 'http',
        networkTransport: 'tcp',
      });
    });

    it('correctly identifies SSE transport', () => {
      class SSEServerTransport {
        sessionId = 'sse-session';
      }
      
      const transport = new SSEServerTransport() as MCPTransport;
      const result = getTransportTypes(transport);
      
      expect(result).toEqual({
        mcpTransport: 'sse',
        networkTransport: 'tcp',
      });
    });

    it('correctly identifies stdio transport', () => {
      class StdioServerTransport {
        sessionId = 'stdio-session';
      }
      
      const transport = new StdioServerTransport() as MCPTransport;
      const result = getTransportTypes(transport);
      
      expect(result).toEqual({
        mcpTransport: 'stdio',
        networkTransport: 'pipe',
      });
    });
  });

  describe('buildTransportAttributes', () => {
    it('handles undefined sessionId gracefully', () => {
      const transport = {
        constructor: { name: 'StreamableHTTPServerTransport' },
        // No sessionId property
      } as MCPTransport;
      
      const attributes = buildTransportAttributes(transport);
      
      // Should not include sessionId in attributes when undefined
      expect(attributes['mcp.session.id']).toBeUndefined();
      expect(attributes['mcp.transport']).toBe('http');
    });

    it('handles transport without sessionId property', () => {
      const transport = {
        constructor: { name: 'StreamableHTTPServerTransport' },
        // sessionId property doesn't exist at all
      } as any;
      
      const attributes = buildTransportAttributes(transport);
      
      // Should not include sessionId in attributes
      expect(attributes['mcp.session.id']).toBeUndefined();
      expect(attributes['mcp.transport']).toBe('http');
    });

    it('includes sessionId when properly set', () => {
      const transport = {
        constructor: { name: 'StreamableHTTPServerTransport' },
        sessionId: 'test-session-123',
      } as MCPTransport;
      
      const attributes = buildTransportAttributes(transport);
      
      expect(attributes['mcp.session.id']).toBe('test-session-123');
      expect(attributes['mcp.transport']).toBe('http');
    });

    it('handles null sessionId gracefully', () => {
      const transport = {
        constructor: { name: 'StreamableHTTPServerTransport' },
        sessionId: null,
      } as any;
      
      const attributes = buildTransportAttributes(transport);
      
      // Should not include null sessionId in attributes
      expect(attributes['mcp.session.id']).toBeUndefined();
      expect(attributes['mcp.transport']).toBe('http');
    });

    it('handles empty string sessionId', () => {
      const transport = {
        constructor: { name: 'StreamableHTTPServerTransport' },
        sessionId: '',
      } as MCPTransport;
      
      const attributes = buildTransportAttributes(transport);
      
      // Empty string is falsy, so should not be included
      expect(attributes['mcp.session.id']).toBeUndefined();
      expect(attributes['mcp.transport']).toBe('http');
    });

    it('preserves all other attributes when sessionId is undefined', () => {
      const transport = {
        constructor: { name: 'StreamableHTTPServerTransport' },
        // No sessionId
      } as MCPTransport;
      
      const attributes = buildTransportAttributes(transport, {
        clientAddress: '127.0.0.1',
        clientPort: 8080,
      });
      
      expect(attributes).toMatchObject({
        'mcp.transport': 'http',
        'network.transport': 'tcp',
        'network.protocol.version': '2.0',
        'client.address': '127.0.0.1',
        'client.port': 8080,
      });
      
      // sessionId should not be present
      expect(attributes['mcp.session.id']).toBeUndefined();
    });
  });
});