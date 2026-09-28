import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as currentScopes from '../../../../src/currentScopes';
import { wrapMcpServerWithSentry } from '../../../../src/integrations/mcp-server';
import { SentrySpan } from '../../../../src/tracing/sentrySpan';
import * as tracing from '../../../../src/tracing/trace';
import { spanToJSON } from '../../../../src/utils/spanUtils';
import { createMockClient, createMockMcpServer, createMockTransport } from './testUtils';

describe('MCP request metadata isolation', () => {
  const spans: SentrySpan[] = [];
  const modernMeta = {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientCapabilities': {},
  };
  const resourcesResult = { resultType: 'complete', resources: [], ttlMs: 0, cacheScope: 'private' };

  beforeEach(() => {
    spans.length = 0;
    vi.spyOn(currentScopes, 'getClient').mockReturnValue(createMockClient());
    vi.spyOn(tracing, 'startInactiveSpan').mockImplementation(options => {
      const span = new SentrySpan(options);
      spans.push(span);
      return span;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function connect() {
    const transport = createMockTransport();
    transport.sessionId = '';
    await wrapMcpServerWithSentry(createMockMcpServer()).connect(transport);
    return transport;
  }

  it('does not inherit optional client or server identity from another modern request', async () => {
    const transport = await connect();
    transport.onmessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/list',
      params: {
        _meta: {
          ...modernMeta,
          'io.modelcontextprotocol/clientInfo': { name: 'first-client', version: '1.0' },
        },
      },
    });
    await transport.send({
      jsonrpc: '2.0',
      id: 1,
      result: {
        ...resourcesResult,
        _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'first-server', version: '1.0' } },
      },
    });
    transport.onmessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'resources/list',
      params: { _meta: modernMeta },
    });
    await transport.send({ jsonrpc: '2.0', id: 2, result: resourcesResult });

    expect(spans.map(span => spanToJSON(span).attributes)).toEqual([
      expect.objectContaining({
        'mcp.client.name': 'first-client',
        'mcp.client.version': '1.0',
        'mcp.server.name': 'first-server',
        'mcp.server.version': '1.0',
        'mcp.protocol.version': '2026-07-28',
      }),
      expect.objectContaining({ 'mcp.protocol.version': '2026-07-28' }),
    ]);
    const secondAttributes = spanToJSON(spans[1]!).attributes;
    for (const attribute of ['mcp.client.name', 'mcp.client.version', 'mcp.server.name', 'mcp.server.version']) {
      expect(secondAttributes).not.toHaveProperty(attribute);
    }
  });

  it('does not attribute a request missing protocol metadata to the preceding modern request', async () => {
    const transport = await connect();
    transport.onmessage({ jsonrpc: '2.0', id: 1, method: 'resources/list', params: { _meta: modernMeta } });
    await transport.send({ jsonrpc: '2.0', id: 1, result: resourcesResult });
    transport.onmessage({ jsonrpc: '2.0', id: 2, method: 'resources/list' });
    await transport.send({ jsonrpc: '2.0', id: 2, error: { code: -32602, message: 'Missing protocol metadata' } });

    expect(spanToJSON(spans[0]!).attributes['mcp.protocol.version']).toBe('2026-07-28');
    expect(spanToJSON(spans[1]!).attributes).not.toHaveProperty('mcp.protocol.version');
  });

  it('preserves established legacy session metadata but does not apply it to a modern request', async () => {
    const transport = await connect();
    transport.sessionId = 'legacy-metadata-session';
    transport.onmessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', clientInfo: { name: 'legacy-client', version: '1.0' } },
    });
    await transport.send({
      jsonrpc: '2.0',
      id: 1,
      result: { protocolVersion: '2025-06-18', serverInfo: { name: 'legacy-server', version: '1.0' } },
    });
    transport.onmessage({ jsonrpc: '2.0', id: 2, method: 'resources/list' });
    await transport.send({ jsonrpc: '2.0', id: 2, result: { resources: [] } });
    transport.onmessage({ jsonrpc: '2.0', id: 3, method: 'resources/list', params: { _meta: modernMeta } });
    await transport.send({ jsonrpc: '2.0', id: 3, result: resourcesResult });

    expect(spanToJSON(spans[1]!).attributes).toEqual(
      expect.objectContaining({
        'mcp.protocol.version': '2025-06-18',
        'mcp.client.name': 'legacy-client',
        'mcp.server.name': 'legacy-server',
        'mcp.session.id': 'legacy-metadata-session',
      }),
    );
    const modernAttributes = spanToJSON(spans[2]!).attributes;
    expect(modernAttributes['mcp.protocol.version']).toBe('2026-07-28');
    for (const attribute of ['mcp.client.name', 'mcp.server.name', 'mcp.session.id']) {
      expect(modernAttributes).not.toHaveProperty(attribute);
    }
    transport.onclose();
  });
});
