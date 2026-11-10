import { MCP_AUTH_CLIENT_NAME, MCP_CLIENT_NAME } from '@sentry/conventions/attributes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentScope } from '../../../../src/currentScopes';
import { wrapMcpServerWithSentry } from '../../../../src/integrations/mcp-server';
import type { McpServerWrapperOptions } from '../../../../src/integrations/mcp-server/types';
import { SentrySpan } from '../../../../src/tracing/sentrySpan';
import * as tracing from '../../../../src/tracing/trace';
import { spanToJSON } from '../../../../src/utils/spanUtils';
import { createMockClient, createMockMcpServer, createMockTransport } from './testUtils';

describe('MCP OAuth client attribution', () => {
  let inactiveSpan: SentrySpan | undefined;
  let transport: ReturnType<typeof createMockTransport>;
  const authInfo = {
    token: 'test-access-token',
    clientId: 'test-client-id',
    scopes: ['tools:read'],
    extra: { clientName: 'Example Desktop' },
  };

  beforeEach(() => {
    inactiveSpan = undefined;
    transport = createMockTransport();
    getCurrentScope().setClient(createMockClient(false));
    vi.spyOn(tracing, 'startInactiveSpan').mockImplementation(options => {
      inactiveSpan = new SentrySpan(options);
      return inactiveSpan;
    });
  });

  afterEach(() => {
    transport.onclose();
    getCurrentScope().setClient(undefined);
    vi.restoreAllMocks();
  });

  async function connect(options?: McpServerWrapperOptions) {
    await wrapMcpServerWithSentry(createMockMcpServer(), options).connect(transport);
  }

  it('passes only client metadata to the resolver and records only its returned name', async () => {
    const getOAuthClientName = vi.fn(() => 'Example Desktop');
    await connect({ getOAuthClientName });
    transport.onmessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { authInfo });
    await transport.send({ jsonrpc: '2.0', id: 1, result: { tools: [] } });

    expect(getOAuthClientName).toHaveBeenCalledExactlyOnceWith({
      clientId: 'test-client-id',
      extra: { clientName: 'Example Desktop' },
    });
    const attributes = spanToJSON(inactiveSpan!).attributes;
    expect(attributes[MCP_AUTH_CLIENT_NAME]).toBe('Example Desktop');
    expect(attributes).not.toHaveProperty(MCP_CLIENT_NAME);
    expect(JSON.stringify(attributes)).not.toContain('test-access-token');
    expect(JSON.stringify(attributes)).not.toContain('test-client-id');
    expect(JSON.stringify(attributes)).not.toContain('tools:read');
  });

  it('accepts a resolver after auto-wrapping and preserves the first explicit resolver', async () => {
    const server = wrapMcpServerWithSentry(createMockMcpServer());
    await server.connect(transport);

    const firstResolver = vi.fn(() => 'First Registered Client');
    const laterResolver = vi.fn(() => 'Later Registered Client');
    const options = { getOAuthClientName: firstResolver };
    wrapMcpServerWithSentry(server, options);
    options.getOAuthClientName = laterResolver;
    wrapMcpServerWithSentry(server, options);

    transport.onmessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { authInfo });

    expect(firstResolver).toHaveBeenCalledExactlyOnceWith({
      clientId: 'test-client-id',
      extra: { clientName: 'Example Desktop' },
    });
    expect(laterResolver).not.toHaveBeenCalled();
    expect(spanToJSON(inactiveSpan!).attributes[MCP_AUTH_CLIENT_NAME]).toBe('First Registered Client');
  });

  it('does not infer OAuth names from provider-specific metadata without a resolver', async () => {
    await connect();
    transport.onmessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { authInfo });
    expect(spanToJSON(inactiveSpan!).attributes).not.toHaveProperty(MCP_AUTH_CLIENT_NAME);
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
    const onmessage = transport.onmessage;
    const result = { result: 'dispatch completed' };
    onmessage.mockReturnValue(result);
    await wrapMcpServerWithSentry(createMockMcpServer(), {
      getOAuthClientName: resolver as McpServerWrapperOptions['getOAuthClientName'],
    }).connect(transport);
    const message = { jsonrpc: '2.0', id: 1, method: 'resources/list' };
    const extra = { authInfo };

    expect(transport.onmessage(message, extra)).toBe(result);
    expect(onmessage).toHaveBeenCalledExactlyOnceWith(message, extra);
    expect(spanToJSON(inactiveSpan!).attributes).not.toHaveProperty(MCP_AUTH_CLIENT_NAME);
  });
});
