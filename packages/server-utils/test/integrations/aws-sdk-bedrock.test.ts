import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
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
import type { NormalizedResponse, RequestMetadata } from '../../src/integrations/aws-sdk/types';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

const CLAUDE_MODEL_ID = 'anthropic.claude-3-5-sonnet-20240620-v1:0';

const CLAUDE_REQUEST_BODY = {
  anthropic_version: 'bedrock-2023-05-31',
  max_tokens: 1024,
  temperature: 0.5,
  messages: [{ role: 'user', content: 'What is the capital of France?' }],
};

function preSpanHook(commandName: string, commandInput: Record<string, unknown>): RequestMetadata {
  return new BedrockRuntimeServiceExtension().requestPreSpanHook({
    serviceName: 'BedrockRuntime',
    commandName,
    commandInput,
  });
}

function invokeModelPreSpanHook(commandInput: Record<string, unknown>): RequestMetadata {
  return preSpanHook('InvokeModel', commandInput);
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
      [GEN_AI_INPUT_MESSAGES]: JSON.stringify(CLAUDE_REQUEST_BODY.messages),
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

const WEATHER_TOOL_SPEC = {
  name: 'get_weather',
  description: 'Get the weather for a city',
  inputSchema: { json: { type: 'object', properties: { city: { type: 'string' } } } },
};

describe('BedrockRuntimeServiceExtension input recording', () => {
  afterEach(() => {
    setCurrentClient(undefined as never);
  });

  it('records Converse system instructions, messages, and tool definitions as message parts', () => {
    const { spanAttributes } = preSpanHook('Converse', {
      modelId: 'amazon.nova-pro-v1:0',
      system: [{ text: 'You are a weather bot.' }, { cachePoint: { type: 'default' } }],
      messages: [
        {
          role: 'user',
          content: [
            { text: 'What is the weather in Kawasaki?' },
            { image: { format: 'png', source: { bytes: new Uint8Array([1, 2, 3]) } } },
            { image: { source: { bytes: new Uint8Array([1]) } } },
            { document: { name: 'forecast', source: { bytes: new Uint8Array([1]) } } },
            { guardContent: { text: { text: 'Guarded text' } } },
            { guardContent: { image: { format: 'jpeg', source: { bytes: new Uint8Array([1]) } } } },
            { cachePoint: { type: 'default' } },
          ],
        },
        {
          role: 'assistant',
          content: [
            { reasoningContent: { reasoningText: { text: 'I need the weather tool.' } } },
            { reasoningContent: { redactedContent: new Uint8Array([1]) } },
            { toolUse: { toolUseId: 'tooluse_1', name: 'get_weather', input: { city: 'Kawasaki' } } },
          ],
        },
        {
          role: 'user',
          content: [
            {
              toolResult: {
                toolUseId: 'tooluse_1',
                content: [{ text: 'Sunny' }, { json: { celsius: 21 } }, { image: { format: 'png' } }],
              },
            },
            { citationsContent: { content: [{ text: 'Cited text' }] } },
          ],
        },
        { role: 'user', content: [{ cachePoint: { type: 'default' } }] },
      ],
      toolConfig: { tools: [{ toolSpec: WEATHER_TOOL_SPEC }, { cachePoint: { type: 'default' } }] },
    });

    expect(spanAttributes).toEqual({
      [GEN_AI_PROVIDER_NAME]: 'aws.bedrock',
      [GEN_AI_OPERATION_NAME]: 'chat',
      [GEN_AI_REQUEST_MODEL]: 'amazon.nova-pro-v1:0',
      [GEN_AI_SYSTEM_INSTRUCTIONS]: JSON.stringify([{ type: 'text', content: 'You are a weather bot.' }]),
      [GEN_AI_INPUT_MESSAGES]: JSON.stringify([
        {
          role: 'user',
          parts: [
            { type: 'text', content: 'What is the weather in Kawasaki?' },
            { type: 'blob', modality: 'image', mime_type: 'image/png' },
            { type: 'blob', modality: 'image' },
            { type: 'blob', modality: 'document' },
            { type: 'text', content: 'Guarded text' },
            { type: 'blob', modality: 'image', mime_type: 'image/jpeg' },
          ],
        },
        {
          role: 'assistant',
          parts: [
            { type: 'reasoning', content: 'I need the weather tool.' },
            { type: 'tool_call', id: 'tooluse_1', name: 'get_weather', arguments: '{"city":"Kawasaki"}' },
          ],
        },
        {
          role: 'user',
          parts: [
            { type: 'tool_call_response', id: 'tooluse_1', result: 'Sunny\n{"celsius":21}' },
            { type: 'text', content: 'Cited text' },
          ],
        },
      ]),
      [GEN_AI_TOOL_DEFINITIONS]: JSON.stringify([WEATHER_TOOL_SPEC]),
    });
  });

  it('records Claude InvokeModel messages as sent, with media replaced by blob parts', () => {
    const tools = [{ name: 'get_weather', input_schema: { type: 'object' } }];
    const image = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } };
    const document = { type: 'document', source: { type: 'base64', data: 'JVBERi0=' } };
    const body = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1024,
      system: [{ type: 'text', text: 'You are a weather bot.' }],
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'What is the weather in Kawasaki?' }, image] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [document] }] },
      ],
      tools,
    };

    const { spanAttributes } = invokeModelPreSpanHook({ modelId: CLAUDE_MODEL_ID, body: JSON.stringify(body) });

    expect(spanAttributes).toEqual({
      [GEN_AI_PROVIDER_NAME]: 'aws.bedrock',
      [GEN_AI_OPERATION_NAME]: 'generate_content',
      [GEN_AI_REQUEST_MODEL]: CLAUDE_MODEL_ID,
      [GEN_AI_REQUEST_MAX_TOKENS]: 1024,
      [GEN_AI_SYSTEM_INSTRUCTIONS]: JSON.stringify([{ type: 'text', content: 'You are a weather bot.' }]),
      [GEN_AI_INPUT_MESSAGES]: JSON.stringify([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is the weather in Kawasaki?' },
            { type: 'blob', modality: 'image', mime_type: 'image/png' },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'blob', modality: 'document' }] }],
        },
      ]),
      [GEN_AI_TOOL_DEFINITIONS]: JSON.stringify(tools),
    });
  });

  it.each([
    { family: 'Titan', modelId: 'amazon.titan-text-express-v1', body: { inputText: 'Kawasaki' } },
    { family: 'Llama', modelId: 'meta.llama3-8b-instruct-v1:0', body: { prompt: 'Kawasaki' } },
    { family: 'Cohere Command R', modelId: 'cohere.command-r-v1:0', body: { message: 'Kawasaki' } },
    { family: 'Cohere Command', modelId: 'cohere.command-text-v14', body: { prompt: 'Kawasaki' } },
    { family: 'Mistral', modelId: 'mistral.mistral-7b-instruct-v0:2', body: { prompt: 'Kawasaki' } },
    { family: 'Claude Text Completions', modelId: 'anthropic.claude-v2', body: { prompt: 'Kawasaki' } },
    {
      family: 'Nova',
      modelId: 'amazon.nova-lite-v1:0',
      body: { messages: [{ role: 'user', content: [{ text: 'Kawasaki' }] }] },
    },
  ])('records the $family InvokeModel prompt as a user message', ({ modelId, body }) => {
    const { spanAttributes } = invokeModelPreSpanHook({ modelId, body: JSON.stringify(body) });

    expect(spanAttributes?.[GEN_AI_INPUT_MESSAGES]).toBe(
      JSON.stringify([{ role: 'user', parts: [{ type: 'text', content: 'Kawasaki' }] }]),
    );
  });

  it.each([
    { commandName: 'Converse', commandInput: { messages: [{ role: 'user', content: [{ text: 'Kawasaki' }] }] } },
    {
      commandName: 'InvokeModel',
      commandInput: { modelId: CLAUDE_MODEL_ID, body: JSON.stringify(CLAUDE_REQUEST_BODY) },
    },
  ])('records no $commandName input when dataCollection.genAI.inputs is off', ({ commandName, commandInput }) => {
    const client = new TestClient(getDefaultTestClientOptions({ dataCollection: { genAI: { inputs: false } } }));
    setCurrentClient(client);
    client.init();

    const { spanAttributes } = preSpanHook(commandName, commandInput);

    expect(spanAttributes).not.toHaveProperty(GEN_AI_INPUT_MESSAGES);
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

  it('reads the Claude stream output tokens from message_delta', async () => {
    const span = startInactiveSpan({ name: 'bedrock' });
    const encoder = new TextEncoder();
    const chunks = [
      { type: 'message_start', message: { role: 'assistant', usage: { input_tokens: 14, output_tokens: 1 } } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 42 } },
    ];
    const data = {
      body: (async function* () {
        for (const chunk of chunks) {
          yield { chunk: { bytes: encoder.encode(JSON.stringify(chunk)) } };
        }
      })(),
    };

    respond(span, 'InvokeModelWithResponseStream', { modelId: CLAUDE_MODEL_ID }, data);
    await drain(data.body);

    expect(spanToJSON(span).attributes?.[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(42);
  });

  const INVOCATION_METRICS = {
    inputTokenCount: 11,
    outputTokenCount: 3,
    invocationLatency: 412,
    firstByteLatency: 198,
  };

  it.each(
    [
      { modelId: 'mistral.mistral-large-2402-v1:0', toChunk: (text: string) => ({ outputs: [{ text }] }) },
      { modelId: 'cohere.command-text-v14', toChunk: (text: string) => ({ generations: [{ text }] }) },
      { modelId: 'cohere.command-r-plus-v1:0', toChunk: (text: string) => ({ text }) },
    ].flatMap(family => [
      {
        ...family,
        when: 'has invocation metrics',
        metrics: INVOCATION_METRICS,
        expected: { [GEN_AI_USAGE_INPUT_TOKENS]: 11, [GEN_AI_USAGE_OUTPUT_TOKENS]: 3 },
      },
      {
        ...family,
        when: 'has no invocation metrics',
        metrics: undefined,
        expected: { [GEN_AI_USAGE_INPUT_TOKENS]: undefined, [GEN_AI_USAGE_OUTPUT_TOKENS]: undefined },
      },
    ]),
  )('records only real token counts when a $modelId stream $when', async ({ modelId, toChunk, metrics, expected }) => {
    const span = startInactiveSpan({ name: 'bedrock' });
    const encoder = new TextEncoder();
    const chunks = [toChunk('The capital'), { ...toChunk(' is Paris.'), 'amazon-bedrock-invocationMetrics': metrics }];
    const data = {
      body: (async function* () {
        for (const chunk of chunks) {
          yield { chunk: { bytes: encoder.encode(JSON.stringify(chunk)) } };
        }
      })(),
    };

    respond(span, 'InvokeModelWithResponseStream', { modelId }, data);
    await drain(data.body);

    const attributes = spanToJSON(span).attributes;
    expect({
      [GEN_AI_USAGE_INPUT_TOKENS]: attributes?.[GEN_AI_USAGE_INPUT_TOKENS],
      [GEN_AI_USAGE_OUTPUT_TOKENS]: attributes?.[GEN_AI_USAGE_OUTPUT_TOKENS],
    }).toEqual(expected);
  });

  it.each([
    {
      family: 'Llama',
      modelId: 'meta.llama3-8b-instruct-v1:0',
      chunks: [
        { generation: 'Kawasaki', prompt_token_count: 12, generation_token_count: 1, stop_reason: null },
        { generation: '.', prompt_token_count: null, generation_token_count: 2, stop_reason: 'stop' },
      ],
      expected: { input: 12, output: 2, total: 14, finishReasons: '["stop"]' },
    },
    {
      family: 'Titan',
      modelId: 'amazon.titan-text-express-v1',
      chunks: [
        { outputText: 'Kawasaki', totalOutputTextTokenCount: null, completionReason: null, inputTextTokenCount: 5 },
        { outputText: '.', totalOutputTextTokenCount: 2, completionReason: 'FINISH', inputTextTokenCount: null },
      ],
      expected: { input: 5, output: 2, total: 7, finishReasons: '["FINISH"]' },
    },
    {
      family: 'Nova',
      modelId: 'amazon.nova-lite-v1:0',
      chunks: [
        { contentBlockDelta: { delta: { text: 'Kawasaki' }, contentBlockIndex: 0 } },
        { messageStop: { stopReason: 'end_turn' } },
        { metadata: { usage: { inputTokens: 7, outputTokens: 2 }, metrics: {}, trace: {} } },
      ],
      expected: { input: 7, output: 2, total: 9, finishReasons: '["end_turn"]' },
    },
  ])('records token usage and finish reasons for a $family stream', async ({ modelId, chunks, expected }) => {
    const span = startInactiveSpan({ name: 'bedrock' });
    const encoder = new TextEncoder();
    const data = {
      body: (async function* () {
        for (const chunk of chunks) {
          yield { chunk: { bytes: encoder.encode(JSON.stringify(chunk)) } };
        }
      })(),
    };

    respond(span, 'InvokeModelWithResponseStream', { modelId }, data);
    await drain(data.body);

    const attributes = spanToJSON(span).attributes;
    expect({
      input: attributes?.[GEN_AI_USAGE_INPUT_TOKENS],
      output: attributes?.[GEN_AI_USAGE_OUTPUT_TOKENS],
      total: attributes?.[GEN_AI_USAGE_TOTAL_TOKENS],
      finishReasons: attributes?.[GEN_AI_RESPONSE_FINISH_REASONS],
    }).toEqual(expected);
  });

  it('ends an InvokeModelWithResponseStream span without a modelId when the stream is drained', async () => {
    const span = startInactiveSpan({ name: 'bedrock' });
    const data = { body: (async function* () {})() };

    respond(span, 'InvokeModelWithResponseStream', {}, data);
    await drain(data.body);

    expect(spanToJSON(span).end_timestamp).toBeDefined();
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

    respond(
      span,
      'Converse',
      { modelId: CLAUDE_MODEL_ID },
      {
        stopReason: 'end_turn',
        usage: {
          inputTokens: 20,
          outputTokens: 50,
          totalTokens: 2170,
          cacheReadInputTokens: 1800,
          cacheWriteInputTokens: 300,
        },
      },
    );

    expect(usageAttributes(span, EXPECTED_USAGE)).toEqual(EXPECTED_USAGE);
  });

  it('counts cache reads and writes in the total tokens for ConverseStream', async () => {
    const span = startInactiveSpan({ name: 'bedrock' });
    const data = {
      stream: (async function* () {
        yield {
          metadata: {
            // The total comes from the cache-adjusted input, like for Converse, not from `totalTokens`.
            usage: {
              inputTokens: 20,
              outputTokens: 50,
              totalTokens: 70,
              cacheReadInputTokens: 1800,
              cacheWriteInputTokens: 300,
            },
          },
        };
      })(),
    };

    respond(span, 'ConverseStream', { modelId: CLAUDE_MODEL_ID }, data);
    await drain(data.stream);

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

    respond(span, 'InvokeModel', { modelId: CLAUDE_MODEL_ID }, { body });

    expect(usageAttributes(span, EXPECTED_USAGE)).toEqual(EXPECTED_USAGE);
  });

  it('counts cache reads and writes as input tokens for a Claude stream', async () => {
    const span = startInactiveSpan({ name: 'bedrock' });
    const messageStart = {
      type: 'message_start',
      message: { id: 'msg_bdrk_01Fv2yWBqLQ8Pp4q9kJbDxXz', role: 'assistant', usage: CLAUDE_USAGE },
    };
    const messageDelta = { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 50 } };
    const data = {
      body: (async function* () {
        yield { chunk: { bytes: encoder.encode(JSON.stringify(messageStart)) } };
        yield { chunk: { bytes: encoder.encode(JSON.stringify(messageDelta)) } };
      })(),
    };

    respond(span, 'InvokeModelWithResponseStream', { modelId: CLAUDE_MODEL_ID }, data);
    await drain(data.body);

    expect(usageAttributes(span, EXPECTED_USAGE)).toEqual(EXPECTED_USAGE);
  });
});
