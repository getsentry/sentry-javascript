import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

const APP_NAME = 'cloudflare-mcp';

test.describe.configure({ mode: 'serial' });

test('sends spans for MCP 2026-07-28 tool calls', async ({ baseURL }) => {
  const url = `${baseURL}/mcp?protocol=modern`;
  const requestSpanPromise = waitForStreamedSpan(APP_NAME, span => {
    return getSpanOp(span) === 'http.server' && span.is_segment && span.attributes['url.full']?.value === url;
  });
  const mcpSpanPromise = waitForStreamedSpan(APP_NAME, span => {
    return span.name === 'tools/call my-tool' && span.attributes['mcp.protocol.version']?.value === '2026-07-28';
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

  const requestSpan = await requestSpanPromise;
  const mcpSpan = await mcpSpanPromise;

  // With span streaming, URL-sourced `http.server` spans are named by method only.
  expect(requestSpan.name).toBe('POST');
  expect(requestSpan.status).toBe('ok');
  expect(requestSpan.attributes['sentry.origin']?.value).toBe('auto.http.cloudflare');
  expect(requestSpan.attributes['sentry.op']?.value).toBe('http.server');
  expect(requestSpan.attributes['sentry.segment.name.source']?.value).toBe('url');
  expect(requestSpan.attributes['http.request.method']?.value).toBe('POST');
  expect(requestSpan.attributes['url.path']?.value).toBe('/mcp');
  expect(requestSpan.attributes['url.full']?.value).toBe(url);
  expect(requestSpan.attributes['url.port']?.value).toBe('38787');
  expect(requestSpan.attributes['url.scheme']?.value).toBe('http:');
  expect(requestSpan.attributes['server.address']?.value).toBe('localhost');
  expect(requestSpan.attributes['http.request.body.size']?.value).toBe(341);
  expect(requestSpan.attributes['user_agent.original']?.value).toBe('node');
  expect(requestSpan.attributes['http.request.header.content_type']?.value).toBe('application/json');
  expect(requestSpan.attributes['network.protocol.name']?.value).toBe('http');
  expect(requestSpan.attributes['network.protocol.version']?.value).toBe('1.1');
  expect(requestSpan.attributes['http.response.status_code']?.value).toBe(200);
  expect(requestSpan.attributes['mcp.server.extra']?.value).toBe(' /|\ ^._.^ /|\ ');

  expect(mcpSpan.trace_id).toBe(requestSpan.trace_id);
  expect(mcpSpan.parent_span_id).toBe(requestSpan.span_id);
  expect(mcpSpan.span_id).not.toBe(requestSpan.span_id);
  expect(mcpSpan.status).toBe('ok');
  expect(mcpSpan.attributes['sentry.op']?.value).toBe('mcp.server');
  expect(mcpSpan.attributes['sentry.origin']?.value).toBe('auto.function.mcp_server');
  expect(mcpSpan.attributes['mcp.transport']?.value).toBe('PerRequestHTTPServerTransport');
  expect(mcpSpan.attributes['network.transport']?.value).toBe('tcp');
  expect(mcpSpan.attributes['mcp.protocol.version']?.value).toBe('2026-07-28');
  expect(mcpSpan.attributes['mcp.client.name']?.value).toBe('cloudflare-modern-client');
  expect(mcpSpan.attributes['mcp.client.version']?.value).toBe('2.0.0');
  expect(mcpSpan.attributes['mcp.server.name']?.value).toBe('cloudflare-mcp');
  expect(mcpSpan.attributes['mcp.server.version']?.value).toBe('2.0.0');
  expect(mcpSpan.attributes['mcp.method.name']?.value).toBe('tools/call');
  expect(mcpSpan.attributes['mcp.request.id']?.value).toBe('modern-tool-call');
  expect(mcpSpan.attributes['mcp.tool.name']?.value).toBe('my-tool');
  expect(mcpSpan.attributes['mcp.request.argument.message']?.value).toBe('"ʕっ•ᴥ•ʔっ"');
  expect(mcpSpan.attributes['mcp.tool.result.content_count']?.value).toBe(1);
  expect(mcpSpan.attributes['mcp.tool.result.content']?.value).toBe('Tool my-tool: ʕっ•ᴥ•ʔっ');
});

test('keeps sending spans for legacy-compatible MCP tool calls', async ({ baseURL }) => {
  const url = `${baseURL}/mcp?protocol=legacy`;
  const mcpSpanPromise = waitForStreamedSpan(APP_NAME, span => {
    return (
      span.name === 'tools/call my-tool' &&
      span.attributes['mcp.request.argument.message']?.value === '"legacy protocol request"'
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

  const mcpSpan = await mcpSpanPromise;

  expect(getSpanOp(mcpSpan)).toBe('mcp.server');
  expect(mcpSpan.status).toBe('ok');
  expect(mcpSpan.attributes['mcp.transport']?.value).toBe('WebStandardStreamableHTTPServerTransport');
  expect(mcpSpan.attributes['mcp.method.name']?.value).toBe('tools/call');
  expect(mcpSpan.attributes['mcp.request.id']?.value).toBe('legacy-tool-call');
  expect(mcpSpan.attributes['mcp.tool.name']?.value).toBe('my-tool');
  expect(mcpSpan.attributes['mcp.tool.result.content']?.value).toBe('Tool my-tool: legacy protocol request');
  expect(mcpSpan.attributes['mcp.protocol.version']).toBeUndefined();
});
