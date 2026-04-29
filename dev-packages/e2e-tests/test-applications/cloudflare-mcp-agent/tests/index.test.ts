import { expect, test } from '@playwright/test';
import { waitForRequest } from '@sentry-internal/test-utils';

test('sends spans for MCP tool calls via MCPAgent (DurableObject)', async ({ baseURL }) => {
  const mcpToolWaiter = waitForRequest('cloudflare-mcp-agent', event => {
    const transaction = event.envelope[1][0][1];
    return (
      typeof transaction !== 'string' &&
      'transaction' in transaction &&
      transaction.transaction === 'tools/call my-tool'
    );
  });

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
          message: 'hello from MCPAgent test',
        },
      },
    }),
  });

  expect(response.status).toBe(200);

  const mcpData = await mcpToolWaiter;
  const mcpEvent = mcpData.envelope[1][0][1];

  expect(mcpEvent.contexts?.trace?.trace_id).toBe(mcpData.envelope[0].trace.trace_id);
  expect(mcpEvent.contexts?.trace).toEqual({
    trace_id: expect.any(String),
    parent_span_id: expect.any(String),
    span_id: expect.any(String),
    op: 'mcp.server',
    origin: 'auto.function.mcp_server',
    data: expect.objectContaining({
      'sentry.origin': 'auto.function.mcp_server',
      'sentry.op': 'mcp.server',
      'mcp.method.name': 'tools/call',
      'mcp.tool.name': 'my-tool',
      'mcp.tool.extra': 'from-mcpagent',
      'mcp.tool.input': '{"message":"hello from MCPAgent test"}',
    }),
  });
});
