import { expect, test } from '@playwright/test';
import { waitForRequest } from '@sentry-internal/test-utils';

const APP_NAME = 'cloudflare-mcp-agent';

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

test('sends spans for MCP tool calls via MCPAgent (DurableObject)', async ({ baseURL }) => {
  const mcpToolWaiter = waitForRequest(APP_NAME, eventData => {
    const event = getTransaction(eventData);
    return event?.transaction === 'tools/call my-tool' && event.contexts?.trace?.op === 'mcp.server';
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
  const mcpEvent = requireTransaction(mcpData);
  const trace = mcpEvent.contexts?.trace;

  expect(trace?.trace_id).toBe(mcpData.envelope[0].trace.trace_id);
  expect(trace?.parent_span_id).toEqual(expect.any(String));
  expect(trace?.op).toBe('mcp.server');
  expect(trace?.origin).toBe('auto.function.mcp_server');
  expect(trace?.status).toBe('ok');
  expect(trace?.data?.['sentry.origin']).toBe('auto.function.mcp_server');
  expect(trace?.data?.['sentry.op']).toBe('mcp.server');
  expect(trace?.data?.['sentry.kind']).toBe('server');
  expect(trace?.data?.['sentry.parent_span_already_sent']).toBe(true);
  expect(trace?.data?.['mcp.method.name']).toBe('tools/call');
  expect(trace?.data?.['jsonrpc.request.id']).toBe('1');
  expect(trace?.data?.['mcp.request.id']).toBe('1');
  expect(trace?.data?.['gen_ai.operation.name']).toBe('execute_tool');
  expect(trace?.data?.['gen_ai.tool.name']).toBe('my-tool');
  expect(trace?.data?.['mcp.tool.name']).toBe('my-tool');
  expect(trace?.data?.['gen_ai.tool.call.arguments']).toBe('{"message":"hello from MCPAgent test"}');
  expect(trace?.data?.['gen_ai.tool.call.result']).toBe(
    '{"content":[{"type":"text","text":"Tool my-tool: hello from MCPAgent test"}]}',
  );
  expect(trace?.data?.['mcp.tool.extra']).toBe('from-mcpagent');
  expect(trace?.data?.['mcp.tool.input']).toBe('{"message":"hello from MCPAgent test"}');
});
