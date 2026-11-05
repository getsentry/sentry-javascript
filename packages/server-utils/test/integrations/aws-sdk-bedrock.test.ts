import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { GEN_AI_GENERATE_CONTENT } from '@sentry/conventions/op';
import type { Span } from '@sentry/core';
import { setCurrentClient, spanToJSON, startInactiveSpan } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BedrockRuntimeServiceExtension } from '../../src/integrations/aws-sdk/services/bedrock-runtime';
import type { RequestMetadata } from '../../src/integrations/aws-sdk/types';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

const CLAUDE_MODEL_ID = 'anthropic.claude-3-5-sonnet-20240620-v1:0';

const CLAUDE_REQUEST_BODY = {
  anthropic_version: 'bedrock-2023-05-31',
  max_tokens: 1024,
  temperature: 0.5,
  messages: [{ role: 'user', content: 'What is the capital of France?' }],
};

function invokeModelPreSpanHook(commandInput: Record<string, unknown>): RequestMetadata {
  return new BedrockRuntimeServiceExtension().requestPreSpanHook({
    serviceName: 'BedrockRuntime',
    commandName: 'InvokeModel',
    commandInput,
  });
}

describe('BedrockRuntimeServiceExtension InvokeModel request', () => {
  it('reads a request body passed as bytes', () => {
    const body = new TextEncoder().encode(JSON.stringify(CLAUDE_REQUEST_BODY));

    const { spanAttributes } = invokeModelPreSpanHook({ modelId: CLAUDE_MODEL_ID, body });

    expect(spanAttributes).toEqual({
      [GEN_AI_PROVIDER_NAME]: 'aws.bedrock',
      [GEN_AI_OPERATION_NAME]: 'generate_content',
      [GEN_AI_REQUEST_MODEL]: CLAUDE_MODEL_ID,
      [GEN_AI_REQUEST_MAX_TOKENS]: 1024,
      [GEN_AI_REQUEST_TEMPERATURE]: 0.5,
    });
  });

  it('keeps the span when the request body is not JSON', () => {
    const metadata = invokeModelPreSpanHook({ modelId: CLAUDE_MODEL_ID, body: 'Human: Hello\n\nAssistant:' });

    expect(metadata).toEqual({
      spanName: `generate_content ${CLAUDE_MODEL_ID}`,
      spanOp: GEN_AI_GENERATE_CONTENT,
      isStream: false,
      spanAttributes: {
        [GEN_AI_PROVIDER_NAME]: 'aws.bedrock',
        [GEN_AI_OPERATION_NAME]: 'generate_content',
        [GEN_AI_REQUEST_MODEL]: CLAUDE_MODEL_ID,
      },
    });
  });

  it('keeps the span when the modelId is missing', () => {
    const metadata = invokeModelPreSpanHook({ body: JSON.stringify(CLAUDE_REQUEST_BODY) });

    expect(metadata).toEqual({
      spanName: 'generate_content',
      spanOp: GEN_AI_GENERATE_CONTENT,
      isStream: false,
      spanAttributes: {
        [GEN_AI_PROVIDER_NAME]: 'aws.bedrock',
        [GEN_AI_OPERATION_NAME]: 'generate_content',
      },
    });
  });
});

describe('BedrockRuntimeServiceExtension token usage with prompt caching', () => {
  const encoder = new TextEncoder();

  // 20 uncached prompt tokens, 1800 read from the cache, and 300 written to it.
  const EXPECTED_INPUT_USAGE = {
    [GEN_AI_USAGE_INPUT_TOKENS]: 2120,
    [GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 1800,
    [GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]: 300,
  };

  const EXPECTED_USAGE = {
    ...EXPECTED_INPUT_USAGE,
    [GEN_AI_USAGE_OUTPUT_TOKENS]: 50,
    [GEN_AI_USAGE_TOTAL_TOKENS]: 2170,
  };

  const CLAUDE_USAGE = {
    input_tokens: 20,
    cache_read_input_tokens: 1800,
    cache_creation_input_tokens: 300,
    output_tokens: 50,
  };

  function respond(span: Span, commandName: string, data: unknown): void {
    new BedrockRuntimeServiceExtension().responseHook(
      {
        data,
        request: { serviceName: 'BedrockRuntime', commandName, commandInput: { modelId: CLAUDE_MODEL_ID } },
        requestId: 'b0a5e5a2-2c2b-4f56-9d0e-8c7c2d3f4a10',
      },
      span,
    );
  }

  function usageAttributes(span: Span, expected: Record<string, unknown>): Record<string, unknown> {
    const attributes = spanToJSON(span).attributes ?? {};
    return Object.fromEntries(Object.keys(expected).map(key => [key, attributes[key]]));
  }

  beforeEach(() => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    setCurrentClient(undefined as never);
  });

  it('counts cache reads and writes as input tokens for Converse', () => {
    const span = startInactiveSpan({ name: 'bedrock' });

    respond(span, 'Converse', {
      stopReason: 'end_turn',
      usage: {
        inputTokens: 20,
        outputTokens: 50,
        totalTokens: 2170,
        cacheReadInputTokens: 1800,
        cacheWriteInputTokens: 300,
      },
    });

    expect(usageAttributes(span, EXPECTED_USAGE)).toEqual(EXPECTED_USAGE);
  });

  it('counts cache reads and writes as input tokens for Claude InvokeModel', () => {
    const span = startInactiveSpan({ name: 'bedrock' });
    const body = encoder.encode(
      JSON.stringify({
        id: 'msg_bdrk_01Fv2yWBqLQ8Pp4q9kJbDxXz',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Paris.' }],
        stop_reason: 'end_turn',
        usage: CLAUDE_USAGE,
      }),
    );

    respond(span, 'InvokeModel', { body });

    expect(usageAttributes(span, EXPECTED_USAGE)).toEqual(EXPECTED_USAGE);
  });

  it('counts cache reads and writes as input tokens for a Claude stream', async () => {
    const span = startInactiveSpan({ name: 'bedrock' });
    const messageStart = {
      type: 'message_start',
      message: { id: 'msg_bdrk_01Fv2yWBqLQ8Pp4q9kJbDxXz', role: 'assistant', usage: CLAUDE_USAGE },
    };
    const data = {
      body: (async function* () {
        yield { chunk: { bytes: encoder.encode(JSON.stringify(messageStart)) } };
      })(),
    };

    respond(span, 'InvokeModelWithResponseStream', data);
    for await (const _ of data.body) {
      // consume
    }

    // The total waits for the final output count, which `message_start` does not carry.
    const expected = { ...EXPECTED_INPUT_USAGE, [GEN_AI_USAGE_TOTAL_TOKENS]: undefined };
    expect(usageAttributes(span, expected)).toEqual(expected);
  });
});
