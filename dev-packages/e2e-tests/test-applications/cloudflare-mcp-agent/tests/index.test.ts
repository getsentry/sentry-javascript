import { expect, test } from '@playwright/test';
import { waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends spans for MCP tool calls via MCPAgent (DurableObject)', async ({ baseURL }) => {
  const privateMessage = 'cloudflare-agent-private-capture-policy-message';
  const mcpSpanPromise = waitForStreamedSpan('cloudflare-mcp-agent', span => span.name === 'tools/call my-tool');

  // Step 1: Initialize the MCP session
  const initResponse = await fetch(`${baseURL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      },
    }),
  });

  expect(initResponse.status).toBe(200);
  const sessionId = initResponse.headers.get('Mcp-Session-Id');
  expect(sessionId).toBeTruthy();

  // Step 2: Send initialized notification
  await fetch(`${baseURL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'Mcp-Session-Id': sessionId!,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  });

  // Step 3: Call the tool with the session ID
  const response = await fetch(`${baseURL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'Mcp-Session-Id': sessionId!,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'my-tool',
        arguments: {
          message: privateMessage,
        },
      },
    }),
  });

  expect(response.status).toBe(200);
  await expect(response.text()).resolves.toContain(`Tool my-tool: ${privateMessage}`);

  const mcpSpan = await mcpSpanPromise;

  expect(mcpSpan).toEqual({
    trace_id: expect.stringMatching(/^[a-f0-9]{32}$/),
    parent_span_id: expect.stringMatching(/^[a-f0-9]{16}$/),
    span_id: expect.stringMatching(/^[a-f0-9]{16}$/),
    name: 'tools/call my-tool',
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    status: 'ok',
    is_segment: true,
    attributes: expect.objectContaining({
      'sentry.origin': { value: 'auto.function.mcp_server', type: 'string' },
      'sentry.op': { value: 'mcp.server', type: 'string' },
      'mcp.method.name': { value: 'tools/call', type: 'string' },
      'mcp.tool.name': { value: 'my-tool', type: 'string' },
      'mcp.tool.extra': { value: 'from-mcpagent', type: 'string' },
      'mcp.tool.result.content_count': { value: 1, type: 'integer' },
      'mcp.tool.result.content_type': { value: 'text', type: 'string' },
    }),
  });
  expect(mcpSpan.attributes['mcp.request.argument.message']).toBeUndefined();
  expect(mcpSpan.attributes['mcp.tool.result.content']).toBeUndefined();
  expect(mcpSpan.attributes['mcp.tool.input']).toBeUndefined();
  expect(JSON.stringify(mcpSpan.attributes)).not.toContain(privateMessage);
});
