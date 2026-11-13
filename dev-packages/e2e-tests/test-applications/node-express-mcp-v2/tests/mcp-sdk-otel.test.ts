import { expect, test } from '@playwright/test';
import {
  MCP_CLIENT_NAME,
  MCP_METHOD_NAME,
  MCP_PROMPT_NAME,
  MCP_REQUEST_ARGUMENT_KEY_BASE,
  MCP_SERVER_NAME,
  MCP_TOOL_RESULT_CONTENT_COUNT,
  SENTRY_KIND,
} from '@sentry/conventions/attributes';
import { HTTP_SERVER, MCP_SERVER } from '@sentry/conventions/op';
import { collectStreamedSpans, getSpanOp, type SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

test.skip(process.env.MCP_SDK_OTEL !== '1', 'Only runs in the MCP SDK OpenTelemetry variant');

/** Resolves with the single MCP span of the request whose span is named `spanName`, once its trace is complete. */
async function getMcpSpan(spanName: string): Promise<SerializedStreamedSpan> {
  const spans = await collectStreamedSpans(
    'node-express-mcp-v2',
    spans => spans.some(span => span.is_segment) && spans.some(span => span.name === spanName),
  );
  const mcpSpans = spans.filter(span => span.attributes?.[MCP_METHOD_NAME]);
  expect(mcpSpans).toHaveLength(1);
  expect(getSpanOp(spans.find(span => span.is_segment)!)).toBe(HTTP_SERVER);

  const [mcpSpan] = mcpSpans;
  expect(mcpSpan!.name).toBe(spanName);
  expect(mcpSpan!.is_segment).toBe(false);
  expect(mcpSpan!.attributes?.[SENTRY_KIND]?.value).toBe('server');
  expect(getSpanOp(mcpSpan!)).toBe(MCP_SERVER);
  return mcpSpan!;
}

test('enriches the MCP SDK spans instead of duplicating them', async ({ baseURL }) => {
  const client = new Client({ name: 'test-client-v2', version: '1.0.0' });

  const initializeSpanPromise = getMcpSpan('initialize');
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`)));
  const initializeSpan = await initializeSpanPromise;
  expect(initializeSpan.attributes?.[MCP_CLIENT_NAME]?.value).toBe('test-client-v2');
  expect(initializeSpan.attributes?.[MCP_SERVER_NAME]?.value).toBe('Echo-V2');

  const toolSpanPromise = getMcpSpan('tools/call echo');
  await client.callTool({ name: 'echo', arguments: { message: 'foobar' } });
  const toolSpan = await toolSpanPromise;
  expect(toolSpan.attributes?.[`${MCP_REQUEST_ARGUMENT_KEY_BASE}.message`]?.value).toBe('"foobar"');
  expect(toolSpan.attributes?.[MCP_TOOL_RESULT_CONTENT_COUNT]?.value).toBe(1);

  const promptSpanPromise = getMcpSpan('prompts/get echo');
  await client.getPrompt({ name: 'echo', arguments: { message: 'foobar' } });
  expect((await promptSpanPromise).attributes?.[MCP_PROMPT_NAME]?.value).toBe('echo');

  const errorSpanPromise = getMcpSpan('tools/call always-error');
  await client.callTool({ name: 'always-error', arguments: {} }).catch(() => undefined);
  expect((await errorSpanPromise).status).toBe('error');

  await client.close();
});
