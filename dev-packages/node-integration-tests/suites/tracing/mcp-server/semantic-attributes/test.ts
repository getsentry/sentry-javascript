import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

function assertAttributes(container: SerializedStreamedSpanContainer, recordContent: boolean): void {
  const requests = container.items.filter(
    span =>
      span.attributes['sentry.op']?.value === 'mcp.server' &&
      ['tools/call', 'prompts/get', 'tools/list'].includes(String(span.attributes['mcp.method.name']?.value)),
  );
  expect(requests).toHaveLength(4);
  for (const request of requests) {
    expect(request.attributes['jsonrpc.request.id']).toEqual({ type: 'string', value: expect.any(String) });
    expect(request.attributes['jsonrpc.request.id']).toEqual(request.attributes['mcp.request.id']);
  }

  const tool = requests.find(span => span.attributes['gen_ai.tool.name']?.value === 'echo');
  expect(tool).toBeDefined();
  expect(tool?.attributes['mcp.tool.name']?.value).toBe('echo');
  expect(tool?.attributes['gen_ai.operation.name']?.value).toBe('execute_tool');
  expect(tool?.attributes['mcp.tool.result.content_count']?.value).toBe(1);
  expect(tool?.attributes['gen_ai.prompt.name']).toBeUndefined();

  const failure = requests.find(span => span.attributes['gen_ai.tool.name']?.value === 'failure');
  expect(failure).toBeDefined();
  expect(failure?.attributes['mcp.tool.name']?.value).toBe('failure');
  expect(failure?.attributes['gen_ai.operation.name']?.value).toBe('execute_tool');
  expect(failure?.attributes['mcp.tool.result.is_error']?.value).toBe(true);
  expect(failure?.attributes['gen_ai.tool.call.result']).toBeUndefined();
  expect(failure?.status).toBe('error');

  const prompt = requests.find(span => span.attributes['mcp.method.name']?.value === 'prompts/get');
  expect(prompt?.attributes['gen_ai.prompt.name']?.value).toBe('greeting');
  expect(prompt?.attributes['mcp.prompt.name']?.value).toBe('greeting');
  expect(prompt?.attributes['gen_ai.operation.name']).toBeUndefined();
  expect(prompt?.attributes['gen_ai.tool.name']).toBeUndefined();
  expect(prompt?.attributes['gen_ai.tool.call.arguments']).toBeUndefined();
  expect(prompt?.attributes['gen_ai.tool.call.result']).toBeUndefined();
  expect(prompt?.attributes['gen_ai.prompt.variable.language']).toBeUndefined();

  const list = requests.find(span => span.attributes['mcp.method.name']?.value === 'tools/list');
  expect(list?.attributes['gen_ai.operation.name']).toBeUndefined();
  expect(list?.attributes['gen_ai.tool.name']).toBeUndefined();
  expect(list?.attributes['gen_ai.tool.call.arguments']).toBeUndefined();
  expect(list?.attributes['gen_ai.tool.call.result']).toBeUndefined();

  if (recordContent) {
    expect(JSON.parse(String(tool?.attributes['gen_ai.tool.call.arguments']?.value))).toEqual({ message: 'Hello' });
    expect(JSON.parse(String(tool?.attributes['gen_ai.tool.call.result']?.value))).toEqual({
      content: [{ type: 'text', text: 'Hello' }],
      structuredContent: { echoed: 'Hello' },
    });
    expect(tool?.attributes['mcp.request.argument.message']?.value).toBe('"Hello"');
    expect(tool?.attributes['mcp.tool.result.content']?.value).toBe('Hello');
    expect(prompt?.attributes['gen_ai.prompt.variable.Language']).toEqual({ type: 'string', value: 'English' });
    expect(prompt?.attributes['mcp.request.argument.language']?.value).toBe('"English"');
  } else {
    for (const request of requests) {
      expect(request.attributes['gen_ai.tool.call.arguments']).toBeUndefined();
      expect(request.attributes['gen_ai.tool.call.result']).toBeUndefined();
      expect(Object.keys(request.attributes).filter(key => key.startsWith('gen_ai.prompt.variable.'))).toEqual([]);
      expect(Object.keys(request.attributes).filter(key => key.startsWith('mcp.request.argument.'))).toEqual([]);
    }
    expect(tool?.attributes['mcp.tool.result.content']).toBeUndefined();
    expect(prompt?.attributes['mcp.prompt.result.message_content']).toBeUndefined();
  }

  expect(JSON.stringify(container)).not.toContain('private-result-metadata');
  expect(JSON.stringify(container)).not.toContain('private-request-state');
}

describe('MCP semantic attributes', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  for (const version of ['v1', 'v2']) {
    createEsmAndCjsTests(
      __dirname,
      `scenario-${version}.mjs`,
      'instrument.mjs',
      (createTestRunner, test) => {
        for (const recordContent of [true, false]) {
          test(`${version} emits canonical and legacy attributes with content capture ${recordContent ? 'enabled' : 'disabled'}`, async () => {
            await createTestRunner()
              .withEnv({ RECORD_CONTENT: String(recordContent) })
              .unordered()
              .expect({ span: container => assertAttributes(container, recordContent) })
              .start()
              .completed();
          });
        }
      },
      {
        copyPaths: ['scenario-common.cjs'],
        ...(version === 'v1' ? { additionalDependencies: { '@modelcontextprotocol/sdk': '1.30.0' } } : {}),
      },
    );
  }
});
