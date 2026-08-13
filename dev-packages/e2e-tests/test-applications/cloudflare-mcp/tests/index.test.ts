import { expect, test } from '@playwright/test';
import { waitForRequest } from '@sentry-internal/test-utils';

const APP_NAME = 'cloudflare-mcp';

function getTransaction(eventData: Awaited<ReturnType<typeof waitForRequest>>) {
  const event = eventData.envelope[1][0][1];
  return typeof event !== 'string' && 'type' in event && event.type === 'transaction' ? event : undefined;
}

function requireTransaction(eventData: Awaited<ReturnType<typeof waitForRequest>>) {
  const event = getTransaction(eventData);
  if (!event) {
    throw new Error('Expected a transaction event');
  }
  return event;
}

function getMcpSpan(transaction: ReturnType<typeof requireTransaction>, description: string) {
  const span = transaction.spans?.find(
    candidate => candidate.op === 'mcp.server' && candidate.description === description,
  );
  expect(span).toBeDefined();
  return span!;
}

test.describe.configure({ mode: 'serial' });

test('sends spans for MCP 2026-07-28 tool calls', async ({ baseURL }) => {
  const url = `${baseURL}/mcp?protocol=modern`;
  const requestWaiter = waitForRequest(APP_NAME, eventData => {
    const event = getTransaction(eventData);
    return (
      event?.transaction === 'POST /mcp' &&
      event.contexts?.trace?.data?.['url.full'] === url &&
      event.spans?.some(
        span =>
          span.op === 'mcp.server' &&
          span.description === 'tools/call my-tool' &&
          span.data?.['mcp.protocol.version'] === '2026-07-28',
      ) === true
    );
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/call',
      'Mcp-Name': 'my-tool',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'modern-tool-call',
      method: 'tools/call',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': {
            name: 'cloudflare-modern-client',
            version: '2.0.0',
          },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
        name: 'my-tool',
        arguments: {
          message: 'ʕっ•ᴥ•ʔっ',
        },
      },
    }),
  });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    jsonrpc: '2.0',
    id: 'modern-tool-call',
    result: {
      resultType: 'complete',
      content: [{ type: 'text', text: 'Tool my-tool: ʕっ•ᴥ•ʔっ' }],
    },
  });

  const requestData = await requestWaiter;
  const requestEvent = requireTransaction(requestData);
  const requestTrace = requestEvent.contexts?.trace;
  const mcpSpan = getMcpSpan(requestEvent, 'tools/call my-tool');

  expect(requestTrace?.op).toBe('http.server');
  expect(requestTrace?.origin).toBe('auto.http.cloudflare');
  expect(requestTrace?.status).toBe('ok');
  expect(requestTrace?.data?.['sentry.origin']).toBe('auto.http.cloudflare');
  expect(requestTrace?.data?.['sentry.op']).toBe('http.server');
  expect(requestTrace?.data?.['sentry.source']).toBe('url');
  expect(requestTrace?.data?.['http.request.method']).toBe('POST');
  expect(requestTrace?.data?.['url.path']).toBe('/mcp');
  expect(requestTrace?.data?.['url.full']).toBe(url);
  expect(requestTrace?.data?.['url.port']).toBe('38787');
  expect(requestTrace?.data?.['url.scheme']).toBe('http:');
  expect(requestTrace?.data?.['server.address']).toBe('localhost');
  expect(requestTrace?.data?.['http.request.body.size']).toBe(341);
  expect(requestTrace?.data?.['user_agent.original']).toBe('node');
  expect(requestTrace?.data?.['http.request.header.content_type']).toBe('application/json');
  expect(requestTrace?.data?.['network.protocol.name']).toBe('HTTP/1.1');
  expect(requestTrace?.data?.['http.response.status_code']).toBe(200);
  expect(requestTrace?.data?.['mcp.server.extra']).toBe(' /|\ ^._.^ /|\ ');
  expect(mcpSpan.trace_id).toBe(requestTrace?.trace_id);
  expect(mcpSpan.parent_span_id).toBe(requestTrace?.span_id);
  expect(mcpSpan.op).toBe('mcp.server');
  expect(mcpSpan.origin).toBe('auto.function.mcp_server');
  expect(mcpSpan.status).toBe('ok');
  expect(mcpSpan.data?.['mcp.transport']).toBe('PerRequestHTTPServerTransport');
  expect(mcpSpan.data?.['network.transport']).toBe('tcp');
  expect(mcpSpan.data?.['mcp.protocol.version']).toBe('2026-07-28');
  expect(mcpSpan.data?.['mcp.client.name']).toBe('cloudflare-modern-client');
  expect(mcpSpan.data?.['mcp.client.version']).toBe('2.0.0');
  expect(mcpSpan.data?.['mcp.server.name']).toBe('cloudflare-mcp');
  expect(mcpSpan.data?.['mcp.server.version']).toBe('2.0.0');
  expect(mcpSpan.data?.['mcp.method.name']).toBe('tools/call');
  expect(mcpSpan.data?.['jsonrpc.request.id']).toBe('modern-tool-call');
  expect(mcpSpan.data?.['mcp.request.id']).toBe('modern-tool-call');
  expect(mcpSpan.data?.['gen_ai.operation.name']).toBe('execute_tool');
  expect(mcpSpan.data?.['gen_ai.tool.call.arguments']).toBe('{"message":"ʕっ•ᴥ•ʔっ"}');
  expect(mcpSpan.data?.['gen_ai.tool.call.result']).toBe(
    '{"content":[{"type":"text","text":"Tool my-tool: ʕっ•ᴥ•ʔっ"}]}',
  );
  expect(mcpSpan.data?.['gen_ai.tool.name']).toBe('my-tool');
  expect(mcpSpan.data?.['mcp.tool.name']).toBe('my-tool');
  expect(mcpSpan.data?.['mcp.request.argument.message']).toBe('"ʕっ•ᴥ•ʔっ"');
  expect(mcpSpan.data?.['mcp.tool.result.content_count']).toBe(1);
  expect(mcpSpan.data?.['mcp.tool.result.content']).toBe('Tool my-tool: ʕっ•ᴥ•ʔっ');
});

test('keeps sending spans for legacy-compatible MCP tool calls', async ({ baseURL }) => {
  const url = `${baseURL}/mcp?protocol=legacy`;
  const requestWaiter = waitForRequest(APP_NAME, eventData => {
    const event = getTransaction(eventData);
    return (
      event?.transaction === 'POST /mcp' &&
      event.contexts?.trace?.data?.['url.full'] === url &&
      event.spans?.some(
        span =>
          span.op === 'mcp.server' &&
          span.description === 'tools/call my-tool' &&
          span.data?.['mcp.request.argument.message'] === '"legacy protocol request"',
      ) === true
    );
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'legacy-tool-call',
      method: 'tools/call',
      params: {
        name: 'my-tool',
        arguments: {
          message: 'legacy protocol request',
        },
      },
    }),
  });

  expect(response.status).toBe(200);

  const requestEvent = requireTransaction(await requestWaiter);
  const requestTrace = requestEvent.contexts?.trace;
  const mcpSpan = getMcpSpan(requestEvent, 'tools/call my-tool');

  expect(requestTrace?.op).toBe('http.server');
  expect(mcpSpan.trace_id).toBe(requestTrace?.trace_id);
  expect(mcpSpan.parent_span_id).toBe(requestTrace?.span_id);
  expect(mcpSpan.status).toBe('ok');
  expect(mcpSpan.data?.['mcp.transport']).toBe('WebStandardStreamableHTTPServerTransport');
  expect(mcpSpan.data?.['mcp.method.name']).toBe('tools/call');
  expect(mcpSpan.data?.['jsonrpc.request.id']).toBe('legacy-tool-call');
  expect(mcpSpan.data?.['mcp.request.id']).toBe('legacy-tool-call');
  expect(mcpSpan.data?.['gen_ai.tool.call.arguments']).toBe('{"message":"legacy protocol request"}');
  expect(mcpSpan.data?.['gen_ai.tool.call.result']).toBe(
    '{"content":[{"type":"text","text":"Tool my-tool: legacy protocol request"}]}',
  );
  expect(mcpSpan.data?.['gen_ai.tool.name']).toBe('my-tool');
  expect(mcpSpan.data?.['mcp.tool.name']).toBe('my-tool');
  expect(mcpSpan.data?.['mcp.protocol.version']).toBeUndefined();
  expect(mcpSpan.data?.['mcp.tool.result.content']).toBe('Tool my-tool: legacy protocol request');
});
