import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentScope } from '../../../../src/currentScopes';
import { wrapMcpServerWithSentry } from '../../../../src/integrations/mcp-server';
import type { McpServerWrapperOptions } from '../../../../src/integrations/mcp-server/types';
import { SentrySpan } from '../../../../src/tracing/sentrySpan';
import * as tracing from '../../../../src/tracing/trace';
import { spanToJSON } from '../../../../src/utils/spanUtils';
import { createMockClient, createMockMcpServer, createMockTransport } from './testUtils';

describe('MCP OAuth client attribution', () => {
  const spans: SentrySpan[] = [];
  const transports: ReturnType<typeof createMockTransport>[] = [];
  const authInfo = {
    token: 'test-access-token',
    clientId: 'test-client-id',
    scopes: ['tools:read'],
    extra: { clientName: 'Example Desktop' },
  };

  beforeEach(() => {
    getCurrentScope().setClient(createMockClient(false));
    vi.spyOn(tracing, 'startInactiveSpan').mockImplementation(options => {
      const span = new SentrySpan(options);
      spans.push(span);
      return span;
    });
  });

  afterEach(() => {
    for (const transport of transports) {
      transport.onclose();
    }
    transports.length = 0;
    spans.length = 0;
    getCurrentScope().setClient(undefined);
    vi.restoreAllMocks();
  });

  async function connect(options?: McpServerWrapperOptions) {
    const transport = createMockTransport();
    transports.push(transport);
    await wrapMcpServerWithSentry(createMockMcpServer(), options).connect(transport);
    return transport;
  }

  it('passes only client metadata to the resolver and records only its returned name', async () => {
    const getOAuthClientName = vi.fn(() => 'Example Desktop');
    const transport = await connect({ getOAuthClientName });
    transport.onmessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { authInfo });
    await transport.send({ jsonrpc: '2.0', id: 1, result: { tools: [] } });

    expect(getOAuthClientName).toHaveBeenCalledExactlyOnceWith({
      clientId: 'test-client-id',
      extra: { clientName: 'Example Desktop' },
    });
    const attributes = spanToJSON(spans[0]!).attributes;
    expect(attributes['mcp.auth.client.name']).toBe('Example Desktop');
    expect(attributes).not.toHaveProperty('mcp.client.name');
    expect(JSON.stringify(attributes)).not.toContain('test-access-token');
    expect(JSON.stringify(attributes)).not.toContain('test-client-id');
    expect(JSON.stringify(attributes)).not.toContain('tools:read');
  });

  it('does not infer OAuth names from provider-specific metadata without a resolver', async () => {
    const transport = await connect();
    transport.onmessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { authInfo });
    expect(spanToJSON(spans[0]!).attributes).not.toHaveProperty('mcp.auth.client.name');
  });

  it.each([
    [
      'throws',
      () => {
        throw new Error('test resolver failure');
      },
    ],
    ['returns a non-string from JavaScript', () => ({ token: 'test-access-token' })],
  ])('preserves request dispatch when the resolver %s', async (_description, resolver) => {
    const transport = createMockTransport();
    const onmessage = transport.onmessage;
    const result = { result: 'dispatch completed' };
    onmessage.mockReturnValue(result);
    transports.push(transport);
    await wrapMcpServerWithSentry(createMockMcpServer(), {
      getOAuthClientName: resolver as McpServerWrapperOptions['getOAuthClientName'],
    }).connect(transport);
    const message = { jsonrpc: '2.0', id: 1, method: 'resources/list' };
    const extra = { authInfo };

    expect(transport.onmessage(message, extra)).toBe(result);
    expect(onmessage).toHaveBeenCalledExactlyOnceWith(message, extra);
    expect(spanToJSON(spans[0]!).attributes).not.toHaveProperty('mcp.auth.client.name');
  });
});
