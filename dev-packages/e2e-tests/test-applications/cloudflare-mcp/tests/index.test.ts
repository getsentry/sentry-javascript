import { expect, test } from '@playwright/test';
import { waitForRequest } from '@sentry-internal/test-utils';

test('sends spans for MCP tool calls', async ({ baseURL }) => {
  const spanRequestWaiter = waitForRequest('cloudflare-mcp', event => {
    const transaction = event.envelope[1][0][1];
    return typeof transaction !== 'string' && 'transaction' in transaction && transaction.transaction === 'POST /mcp';
  });

  const spanMcpWaiter = waitForRequest('cloudflare-mcp', event => {
    const transaction = event.envelope[1][0][1];
    return (
      typeof transaction !== 'string' &&
      'transaction' in transaction &&
      transaction.transaction === 'tools/call my-tool'
    );
  });

  const response = await fetch(`${baseURL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'my-tool',
        arguments: {
          message: 'ʕっ•ᴥ•ʔっ',
        },
      },
    }),
  });

  expect(response.status).toBe(200);

  const requestData = await spanRequestWaiter;
  const mcpData = await spanMcpWaiter;

  const requestEvent = requestData.envelope[1][0][1];
  const mcpEvent = mcpData.envelope[1][0][1];

  // Check that the events have contexts
  // this is for TypeScript type safety
  if (
    typeof mcpEvent === 'string' ||
    !('contexts' in mcpEvent) ||
    typeof requestEvent === 'string' ||
    !('contexts' in requestEvent) ||
    !('spans' in requestEvent)
  ) {
    throw new Error("Events don't have contexts");
  }

  expect(mcpEvent.contexts?.trace?.trace_id).toBe((mcpData.envelope[0].trace as any).trace_id);
  expect(requestData.envelope[0].event_id).not.toBe(mcpData.envelope[0].event_id);

  expect(requestEvent.contexts?.trace).toEqual({
    span_id: expect.any(String),
    trace_id: expect.any(String),
    data: expect.objectContaining({
      'sentry.origin': 'auto.http.cloudflare',
      'sentry.op': 'http.server',
      'sentry.source': 'url',
      'sentry.sample_rate': 1,
      'http.request.method': 'POST',
      'url.path': '/mcp',
      'url.full': 'http://localhost:38787/mcp',
      'url.port': '38787',
      'url.scheme': 'http:',
      'server.address': 'localhost',
      'user_agent.original': 'node',
      'network.protocol.name': 'HTTP/1.1',
    }),
    op: 'http.server',
    origin: 'auto.http.cloudflare',
  });

  expect(requestEvent.spans).toEqual([
    {
      data: {
        'sentry.origin': 'auto.http.cloudflare',
        'sentry.op': 'http.server',
        'sentry.source': 'url',
        'http.request.method': 'POST',
        'url.path': '/mcp',
        'url.full': 'http://localhost:38787/mcp',
        'url.port': '38787',
        'url.scheme': 'http:',
        'server.address': 'localhost',
        'http.request.body.size': 120,
        'user_agent.original': 'node',
        'http.request.header.accept': 'application/json, text/event-stream',
        'http.request.header.accept_encoding': 'br, gzip',
        'http.request.header.accept_language': '*',
        'http.request.header.cf_connecting_ip': '::1',
        'http.request.header.content_length': '120',
        'http.request.header.content_type': 'application/json',
        'http.request.header.host': 'localhost:38787',
        'http.request.header.sec_fetch_mode': 'cors',
        'http.request.header.user_agent': 'node',
        'network.protocol.name': 'HTTP/1.1',
        'mcp.server.extra': ' /|\ ^._.^ /|\ ',
        'http.response.status_code': 200,
      },
      description: 'fetch',
      op: 'http.server',
      parent_span_id: expect.any(String),
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      status: 'ok',
      timestamp: expect.any(Number),
      trace_id: expect.any(String),
      origin: 'auto.http.cloudflare',
    },
  ]);

  expect(mcpEvent.contexts?.trace).toEqual({
    trace_id: expect.any(String),
    parent_span_id: requestEvent.spans?.[0]?.span_id,
    span_id: expect.any(String),
    op: 'mcp.server',
    origin: 'auto.function.mcp_server',
    data: {
      'sentry.origin': 'auto.function.mcp_server',
      'sentry.op': 'mcp.server',
      'sentry.source': 'route',
      'mcp.transport': 'WorkerTransport',
      'network.transport': 'unknown',
      'network.protocol.version': '2.0',
      'mcp.method.name': 'tools/call',
      'mcp.request.id': '1',
      'mcp.tool.name': 'my-tool',
      'mcp.request.argument.message': '"ʕっ•ᴥ•ʔっ"',
      'mcp.tool.extra': 'ƸӜƷ',
      'mcp.tool.input': '{"message":"ʕっ•ᴥ•ʔっ"}',
      'mcp.tool.result.content_count': 1,
      'mcp.tool.result.content_type': 'text',
      'mcp.tool.result.content': 'Tool my-tool: ʕっ•ᴥ•ʔっ',
    },
  });
});
