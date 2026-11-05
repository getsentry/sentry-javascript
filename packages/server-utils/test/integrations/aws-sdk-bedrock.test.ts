import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
} from '@sentry/conventions/attributes';
import { GEN_AI_GENERATE_CONTENT } from '@sentry/conventions/op';
import type { Span } from '@sentry/core';
import { setCurrentClient, spanToJSON, startInactiveSpan } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BedrockRuntimeServiceExtension } from '../../src/integrations/aws-sdk/services/bedrock-runtime';
import type { NormalizedResponse, RequestMetadata } from '../../src/integrations/aws-sdk/types';
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

const STREAM_COMMANDS = [
  { commandName: 'ConverseStream', streamField: 'stream' },
  { commandName: 'InvokeModelWithResponseStream', streamField: 'body' },
];

function respond(
  span: Span,
  commandName: string,
  commandInput: Record<string, unknown>,
  data: unknown,
  abortSignal?: AbortSignal,
): void {
  const response: NormalizedResponse = {
    data,
    request: { serviceName: 'BedrockRuntime', commandName, commandInput, abortSignal },
    requestId: 'b0a5e5a2-2c2b-4f56-9d0e-8c7c2d3f4a10',
  };
  new BedrockRuntimeServiceExtension().responseHook(response, span);
}

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _ of stream) {
    // consume
  }
}

describe('BedrockRuntimeServiceExtension stream spans', () => {
  beforeEach(() => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    setCurrentClient(undefined as never);
  });

  it.each(
    STREAM_COMMANDS.flatMap(command => [
      { ...command, when: 'fails', abortSignal: undefined, status: 'error' },
      // `cancelled` is sent as `ok` under span streaming.
      { ...command, when: 'is aborted by the caller', abortSignal: AbortSignal.abort(), status: 'ok' },
    ]),
  )(
    'sets status $status when a $commandName stream $when',
    async ({ commandName, streamField, abortSignal, status }) => {
      const span = startInactiveSpan({ name: 'bedrock' });
      const error = new Error('ThrottlingException: Too many tokens, please wait before trying again.');
      const data: Record<string, unknown> = {
        [streamField]: (async function* () {
          yield { messageStart: { role: 'assistant' } };
          throw error;
        })(),
      };

      respond(span, commandName, { modelId: CLAUDE_MODEL_ID }, data, abortSignal);

      await expect(drain(data[streamField] as AsyncIterable<unknown>)).rejects.toBe(error);
      expect(spanToJSON(span).status).toBe(status);
      expect(spanToJSON(span).end_timestamp).toBeDefined();
    },
  );

  it.each(STREAM_COMMANDS)('ends a $commandName span when the response has no stream', ({ commandName }) => {
    const span = startInactiveSpan({ name: 'bedrock' });

    respond(span, commandName, { modelId: CLAUDE_MODEL_ID }, {});

    expect(spanToJSON(span).end_timestamp).toBeDefined();
  });

  it('ends an InvokeModelWithResponseStream span without a modelId when the stream is drained', async () => {
    const span = startInactiveSpan({ name: 'bedrock' });
    const data = { body: (async function* () {})() };

    respond(span, 'InvokeModelWithResponseStream', {}, data);
    await drain(data.body);

    expect(spanToJSON(span).end_timestamp).toBeDefined();
  });
});
