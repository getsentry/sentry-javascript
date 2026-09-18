import { describe, expect, it } from 'vitest';
import { buildTransportAttributes } from '../../../../src/integrations/mcp-server/sessionExtraction';
import { createMockStdioTransport, createMockTransport } from './testUtils';

describe('MCP network attributes', () => {
  it('does not report JSON-RPC as a network protocol for stdio', () => {
    const attributes = buildTransportAttributes(createMockStdioTransport());

    expect(attributes).toMatchObject({
      'mcp.transport': 'StdioServerTransport',
      'network.transport': 'pipe',
    });
    expect(attributes).not.toHaveProperty('network.protocol.name');
    expect(attributes).not.toHaveProperty('network.protocol.version');
    expect(attributes).not.toHaveProperty('user_agent.original');
  });

  it('does not infer a network transport from a custom class name', () => {
    const transport = createMockTransport();
    Object.defineProperty(transport, 'constructor', { value: { name: 'CustomHttpStdioTransport' } });

    expect(buildTransportAttributes(transport)).toEqual({
      'mcp.transport': 'CustomHttpStdioTransport',
      'mcp.session.id': 'test-session-123',
    });
  });

  it.each([
    ['HTTP/1.1', '1.1', 'tcp'],
    ['HTTP/2', '2', 'tcp'],
    ['HTTP/3', '3', 'quic'],
  ])('records Cloudflare %s metadata from the current request', (httpProtocol, version, networkTransport) => {
    const request = Object.assign(new Request('https://example.com/mcp'), { cf: { httpProtocol } });
    const attributes = buildTransportAttributes(createMockTransport(), { request });

    expect(attributes).toMatchObject({
      'network.protocol.name': 'http',
      'network.protocol.version': version,
      'network.transport': networkTransport,
    });
  });

  it('omits unknown HTTP version and transport instead of inferring them from the URL or headers', () => {
    const request = new Request('https://example.com/mcp', {
      headers: { 'MCP-Protocol-Version': '2026-07-28', 'X-Forwarded-Proto': 'https' },
    });
    const attributes = buildTransportAttributes(createMockTransport(), { request });

    expect(attributes['network.protocol.name']).toBe('http');
    expect(attributes).not.toHaveProperty('network.protocol.version');
    expect(attributes).not.toHaveProperty('network.transport');
  });
});
