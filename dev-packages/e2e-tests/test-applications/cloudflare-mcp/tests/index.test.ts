import { expect, test } from '@playwright/test';
import { waitForRequest } from '@sentry-internal/test-utils';

const APP_NAME = 'cloudflare-mcp';

function getTransaction(eventData: Awaited<ReturnType<typeof waitForRequest>>) {
  const event = eventData.envelope[1][0][1];
  return typeof event !== 'string' && 'transaction' in event ? event : undefined;
}

function requireTransaction(eventData: Awaited<ReturnType<typeof waitForRequest>>) {
  const event = getTransaction(eventData);
  if (!event) {
    throw new Error('Expected a transaction event');
  }
  return event;
}

test.describe.configure({ mode: 'serial' });

test('sends spans for MCP 2026-07-28 tool calls', async ({ baseURL }) => {
  const url = `${baseURL}/mcp?protocol=modern`;
  const requestWaiter = waitForRequest(APP_NAME, eventData => {
    const event = getTransaction(eventData);
    return event?.transaction === 'POST /mcp' && event.contexts?.trace?.data?.['url.full'] === url;
  });
  const mcpWaiter = waitForRequest(APP_NAME, eventData => {
    const event = getTransaction(eventData);
    return (
      event?.transaction === 'tools/call my-tool' &&
      event.contexts?.trace?.data?.['mcp.protocol.version'] === '2026-07-28'
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
  const mcpData = await mcpWaiter;
  const requestEvent = requireTransaction(requestData);
  const mcpEvent = requireTransaction(mcpData);
  const requestTrace = requestEvent.contexts?.trace;
  const mcpTrace = mcpEvent.contexts?.trace;

  expect(requestTrace?.op).toBe('http.server');
  expect(requestTrace?.origin).toBe('auto.http.cloudflare');
  expect(requestTrace?.status).toBe('ok');
  expect(requestTrace?.data?.['sentry.origin']).toBe('auto.http.cloudflare');
  expect(requestTrace?.data?.['sentry.op']).toBe('http.server');
  expect(requestTrace?.data?.['sentry.segment.name.source']).toBe('url');
  expect(requestTrace?.data?.['http.request.method']).toBe('POST');
  expect(requestTrace?.data?.['url.path']).toBe('/mcp');
  expect(requestTrace?.data?.['url.full']).toBe(url);
  expect(requestTrace?.data?.['url.port']).toBe('38787');
  expect(requestTrace?.data?.['url.scheme']).toBe('http:');
  expect(requestTrace?.data?.['server.address']).toBe('localhost');
  expect(requestTrace?.data?.['http.request.body.size']).toBe(341);
  expect(requestTrace?.data?.['user_agent.original']).toBe('node');
  expect(requestTrace?.data?.['http.request.header.content_type']).toBe('application/json');
  expect(requestTrace?.data?.['network.protocol.name']).toBe('http');
  expect(requestTrace?.data?.['network.protocol.version']).toBe('1.1');
  expect(requestTrace?.data?.['http.response.status_code']).toBe(200);
  expect(requestTrace?.data?.['mcp.server.extra']).toBe(' /|\ ^._.^ /|\ ');
  expect(mcpTrace?.trace_id).toBe(requestTrace?.trace_id);
  expect(mcpTrace?.trace_id).toBe((mcpData.envelope[0].trace as { trace_id: string }).trace_id);
  expect(mcpTrace?.parent_span_id).toBe(requestTrace?.span_id);
  expect(requestData.envelope[0].event_id).not.toBe(mcpData.envelope[0].event_id);
  expect(mcpTrace?.op).toBe('mcp.server');
  expect(mcpTrace?.origin).toBe('auto.function.mcp_server');
  expect(mcpTrace?.status).toBe('ok');
  expect(mcpTrace?.data?.['mcp.transport']).toBe('PerRequestHTTPServerTransport');
  expect(mcpTrace?.data?.['network.transport']).toBe('tcp');
  expect(mcpTrace?.data?.['mcp.protocol.version']).toBe('2026-07-28');
  expect(mcpTrace?.data?.['mcp.client.name']).toBe('cloudflare-modern-client');
  expect(mcpTrace?.data?.['mcp.client.version']).toBe('2.0.0');
  expect(mcpTrace?.data?.['mcp.server.name']).toBe('cloudflare-mcp');
  expect(mcpTrace?.data?.['mcp.server.version']).toBe('2.0.0');
  expect(mcpTrace?.data?.['mcp.method.name']).toBe('tools/call');
  expect(mcpTrace?.data?.['mcp.request.id']).toBe('modern-tool-call');
  expect(mcpTrace?.data?.['mcp.tool.name']).toBe('my-tool');
  expect(mcpTrace?.data?.['mcp.request.argument.message']).toBe('"ʕっ•ᴥ•ʔっ"');
  expect(mcpTrace?.data?.['mcp.tool.result.content_count']).toBe(1);
  expect(mcpTrace?.data?.['mcp.tool.result.content']).toBe('Tool my-tool: ʕっ•ᴥ•ʔっ');
});

test('keeps sending spans for legacy-compatible MCP tool calls', async ({ baseURL }) => {
  const url = `${baseURL}/mcp?protocol=legacy`;
  const mcpWaiter = waitForRequest(APP_NAME, eventData => {
    const event = getTransaction(eventData);
    return (
      event?.transaction === 'tools/call my-tool' &&
      event.contexts?.trace?.data?.['mcp.request.argument.message'] === '"legacy protocol request"'
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

  const mcpEvent = requireTransaction(await mcpWaiter);
  const trace = mcpEvent.contexts?.trace;

  expect(trace?.op).toBe('mcp.server');
  expect(trace?.status).toBe('ok');
  expect(trace?.data?.['mcp.transport']).toBe('WebStandardStreamableHTTPServerTransport');
  expect(trace?.data?.['mcp.method.name']).toBe('tools/call');
  expect(trace?.data?.['mcp.request.id']).toBe('legacy-tool-call');
  expect(trace?.data?.['mcp.tool.name']).toBe('my-tool');
  expect(trace?.data?.['mcp.protocol.version']).toBeUndefined();
  expect(trace?.data?.['mcp.tool.result.content']).toBe('Tool my-tool: legacy protocol request');
});
