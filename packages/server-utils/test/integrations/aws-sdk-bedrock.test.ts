import type { Span } from '@sentry/core';
import { getMainCarrier, setCurrentClient, spanToJSON, startInactiveSpan } from '@sentry/core';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GenAiOptions } from '../../src/ai/core/utils';
import { BedrockRuntimeServiceExtension } from '../../src/integrations/aws-sdk/services/bedrock-runtime';
import type { BedrockStreamState } from '../../src/integrations/aws-sdk/services/bedrock-runtime-content';
import {
  appendStreamBlock,
  instrumentBedrockStream,
  startStreamToolCall,
} from '../../src/integrations/aws-sdk/services/bedrock-runtime-content';
import type { NormalizedResponse } from '../../src/integrations/aws-sdk/types';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

const CLAUDE = 'anthropic.claude-3-5-sonnet-20240620-v1:0';
const encoder = new TextEncoder();

function setUpClient(genAI?: { inputs?: boolean; outputs?: boolean }): void {
  const client = new TestClient(
    getDefaultTestClientOptions({ tracesSampleRate: 1, ...(genAI ? { dataCollection: { genAI } } : {}) }),
  );
  setCurrentClient(client);
  client.init();
}

/** Run a command through the extension the way the aws-sdk subscriber does. */
function send(
  commandName: string,
  commandInput: Record<string, unknown>,
  data: Record<string, unknown>,
  options?: GenAiOptions,
): { span: Span; response: NormalizedResponse } {
  const extension = new BedrockRuntimeServiceExtension(options);
  const request = { serviceName: 'BedrockRuntime', commandName, commandInput };
  const metadata = extension.requestPreSpanHook(request);
  const span = startInactiveSpan({
    name: metadata.spanName!,
    op: metadata.spanOp,
    attributes: metadata.spanAttributes as Record<string, string>,
  });
  const response = { data, request };
  extension.responseHook(response, span);
  if (!metadata.isStream) {
    span.end();
  }
  return { span, response };
}

function attributes(span: Span): Record<string, unknown> {
  return spanToJSON(span).attributes ?? {};
}

async function* asyncIterable<T>(items: T[], error?: Error): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
  if (error) {
    throw error;
  }
}

async function drain(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const items: unknown[] = [];
  for await (const item of stream) {
    items.push(item);
  }
  return items;
}

function invokeModelChunk(chunk: Record<string, unknown>): { chunk: { bytes: Uint8Array } } {
  return { chunk: { bytes: encoder.encode(JSON.stringify(chunk)) } };
}

const CONVERSE_INPUT = {
  modelId: CLAUDE,
  system: [{ text: 'You are a weather bot.' }, { cachePoint: { type: 'default' } }],
  messages: [
    {
      role: 'user',
      content: [
        { text: 'What is the weather in Vienna?' },
        { image: { format: 'png', source: { bytes: new Uint8Array([1, 2, 3]) } } },
      ],
    },
    {
      role: 'assistant',
      content: [
        { reasoningContent: { reasoningText: { text: 'I should call the tool.', signature: 'sig' } } },
        { toolUse: { toolUseId: 'tool-1', name: 'get_weather', input: { city: 'Vienna' } } },
      ],
    },
    {
      role: 'user',
      content: [{ toolResult: { toolUseId: 'tool-1', content: [{ json: { temperature: 21 } }], status: 'success' } }],
    },
  ],
  inferenceConfig: { maxTokens: 100 },
  toolConfig: {
    tools: [
      {
        toolSpec: {
          name: 'get_weather',
          description: 'Get the weather',
          inputSchema: { json: { type: 'object', properties: { city: { type: 'string' } } } },
        },
      },
      { cachePoint: { type: 'default' } },
    ],
  },
};

const CONVERSE_OUTPUT = {
  output: {
    message: {
      role: 'assistant',
      content: [
        { text: 'It is 21°C in Vienna.' },
        { toolUse: { toolUseId: 'tool-2', name: 'get_forecast', input: { city: 'Vienna' } } },
      ],
    },
  },
  stopReason: 'tool_use',
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 135, cacheReadInputTokens: 100, cacheWriteInputTokens: 5 },
};

describe('BedrockRuntimeServiceExtension', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  describe('Converse', () => {
    it('records system instructions, messages, and tool definitions as message parts', () => {
      setUpClient();

      const { span } = send('Converse', CONVERSE_INPUT, CONVERSE_OUTPUT);

      expect(attributes(span)).toMatchObject({
        [GEN_AI_REQUEST_MODEL]: CLAUDE,
        [GEN_AI_REQUEST_MAX_TOKENS]: 100,
        [GEN_AI_SYSTEM_INSTRUCTIONS]: JSON.stringify([{ type: 'text', content: 'You are a weather bot.' }]),
        [GEN_AI_INPUT_MESSAGES]: JSON.stringify([
          {
            role: 'user',
            parts: [
              { type: 'text', content: 'What is the weather in Vienna?' },
              { type: 'blob', modality: 'image', mime_type: 'image/png' },
            ],
          },
          {
            role: 'assistant',
            parts: [
              { type: 'reasoning', content: 'I should call the tool.' },
              { type: 'tool_call', id: 'tool-1', name: 'get_weather', arguments: '{"city":"Vienna"}' },
            ],
          },
          { role: 'user', parts: [{ type: 'tool_call_response', id: 'tool-1', result: '{"temperature":21}' }] },
        ]),
        [GEN_AI_TOOL_DEFINITIONS]: JSON.stringify([CONVERSE_INPUT.toolConfig.tools[0]!.toolSpec]),
      });
    });

    it('records the assistant turn, finish reason, and token usage including cached tokens', () => {
      setUpClient();

      const { span } = send('Converse', CONVERSE_INPUT, CONVERSE_OUTPUT);

      expect(attributes(span)).toMatchObject({
        [GEN_AI_OUTPUT_MESSAGES]: JSON.stringify([
          {
            role: 'assistant',
            parts: [
              { type: 'text', content: 'It is 21°C in Vienna.' },
              { type: 'tool_call', id: 'tool-2', name: 'get_forecast', arguments: '{"city":"Vienna"}' },
            ],
            finish_reason: 'tool_use',
          },
        ]),
        [GEN_AI_RESPONSE_TEXT]: 'It is 21°C in Vienna.',
        [GEN_AI_RESPONSE_TOOL_CALLS]: JSON.stringify([
          { id: 'tool-2', name: 'get_forecast', arguments: { city: 'Vienna' } },
        ]),
        [GEN_AI_RESPONSE_FINISH_REASONS]: '["tool_use"]',
        [GEN_AI_USAGE_INPUT_TOKENS]: 115,
        [GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 100,
        [GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]: 5,
        [GEN_AI_USAGE_OUTPUT_TOKENS]: 20,
        [GEN_AI_USAGE_TOTAL_TOKENS]: 135,
      });
    });

    it('records no content when dataCollection.genAI turns it off', () => {
      setUpClient({ inputs: false, outputs: false });

      const { span } = send('Converse', CONVERSE_INPUT, CONVERSE_OUTPUT);

      const attrs = attributes(span);
      for (const key of [
        GEN_AI_SYSTEM_INSTRUCTIONS,
        GEN_AI_INPUT_MESSAGES,
        GEN_AI_TOOL_DEFINITIONS,
        GEN_AI_OUTPUT_MESSAGES,
        GEN_AI_RESPONSE_TEXT,
        GEN_AI_RESPONSE_TOOL_CALLS,
      ]) {
        expect(attrs).not.toHaveProperty(key);
      }
      expect(attrs).toMatchObject({
        [GEN_AI_USAGE_OUTPUT_TOKENS]: 20,
        [GEN_AI_RESPONSE_FINISH_REASONS]: '["tool_use"]',
      });
    });

    it('lets the integration options override dataCollection.genAI', () => {
      setUpClient({ inputs: false, outputs: true });

      const { span } = send('Converse', CONVERSE_INPUT, CONVERSE_OUTPUT, { recordInputs: true, recordOutputs: false });

      const attrs = attributes(span);
      expect(attrs).toHaveProperty(GEN_AI_INPUT_MESSAGES);
      expect(attrs).not.toHaveProperty(GEN_AI_OUTPUT_MESSAGES);
    });

    it('reads dataCollection.genAI from the client current at call time', () => {
      const extension = new BedrockRuntimeServiceExtension();
      const request = { serviceName: 'BedrockRuntime', commandName: 'Converse', commandInput: CONVERSE_INPUT };

      setUpClient({ inputs: false });
      expect(extension.requestPreSpanHook(request).spanAttributes).not.toHaveProperty(GEN_AI_INPUT_MESSAGES);

      setUpClient();
      expect(extension.requestPreSpanHook(request).spanAttributes).toHaveProperty(GEN_AI_INPUT_MESSAGES);
    });
  });

  describe('ConverseStream', () => {
    const STREAM_EVENTS = [
      { messageStart: { role: 'assistant' } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { reasoningContent: { text: 'Thinking.' } } } },
      { contentBlockDelta: { contentBlockIndex: 1, delta: { text: 'Hello ' } } },
      { contentBlockDelta: { contentBlockIndex: 1, delta: { text: 'there' } } },
      { contentBlockStop: { contentBlockIndex: 1 } },
      { contentBlockStart: { contentBlockIndex: 2, start: { toolUse: { toolUseId: 'tool-1', name: 'get_weather' } } } },
      { contentBlockDelta: { contentBlockIndex: 2, delta: { toolUse: { input: '{"city":' } } } },
      { contentBlockDelta: { contentBlockIndex: 2, delta: { toolUse: { input: '"Vienna"}' } } } },
      { contentBlockStop: { contentBlockIndex: 2 } },
      { messageStop: { stopReason: 'tool_use' } },
      { metadata: { usage: { inputTokens: 7, outputTokens: 9, totalTokens: 16, cacheReadInputTokens: 3 } } },
    ];

    it('passes every event through and records the accumulated response when the stream is drained', async () => {
      setUpClient();

      const { span, response } = send('ConverseStream', CONVERSE_INPUT, { stream: asyncIterable(STREAM_EVENTS) });

      expect(span.isRecording()).toBe(true);
      await expect(drain(response.data.stream)).resolves.toEqual(STREAM_EVENTS);
      expect(span.isRecording()).toBe(false);

      expect(spanToJSON(span).status).toBe('ok');
      expect(attributes(span)).toMatchObject({
        [GEN_AI_INPUT_MESSAGES]: expect.any(String),
        [GEN_AI_RESPONSE_STREAMING]: true,
        [GEN_AI_OUTPUT_MESSAGES]: JSON.stringify([
          {
            role: 'assistant',
            parts: [
              { type: 'reasoning', content: 'Thinking.' },
              { type: 'text', content: 'Hello there' },
              { type: 'tool_call', id: 'tool-1', name: 'get_weather', arguments: '{"city":"Vienna"}' },
            ],
            finish_reason: 'tool_use',
          },
        ]),
        [GEN_AI_RESPONSE_TEXT]: 'Hello there',
        [GEN_AI_RESPONSE_TOOL_CALLS]: JSON.stringify([
          { id: 'tool-1', name: 'get_weather', arguments: { city: 'Vienna' } },
        ]),
        [GEN_AI_RESPONSE_FINISH_REASONS]: '["tool_use"]',
        [GEN_AI_USAGE_INPUT_TOKENS]: 10,
        [GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 3,
        [GEN_AI_USAGE_OUTPUT_TOKENS]: 9,
      });
    });

    it('ends the span with the partial response when the caller stops early', async () => {
      setUpClient();

      const { span, response } = send('ConverseStream', CONVERSE_INPUT, { stream: asyncIterable(STREAM_EVENTS) });

      for await (const event of response.data.stream) {
        if (event.contentBlockStop) {
          break;
        }
      }

      expect(span.isRecording()).toBe(false);
      expect(spanToJSON(span).status).toBe('ok');
      expect(attributes(span)).toMatchObject({ [GEN_AI_RESPONSE_TEXT]: 'Hello there' });
    });

    it('marks the span as failed and rethrows when the stream fails', async () => {
      setUpClient();
      const error = new Error('modelStreamErrorException');

      const { span, response } = send('ConverseStream', CONVERSE_INPUT, {
        stream: asyncIterable(STREAM_EVENTS.slice(0, 3), error),
      });

      await expect(drain(response.data.stream)).rejects.toBe(error);
      expect(span.isRecording()).toBe(false);
      expect(spanToJSON(span).status).toBe('error');
      expect(attributes(span)).toMatchObject({ [GEN_AI_RESPONSE_TEXT]: 'Hello ' });
    });

    it('records no output when dataCollection.genAI.outputs is off', async () => {
      setUpClient({ outputs: false });

      const { span, response } = send('ConverseStream', CONVERSE_INPUT, { stream: asyncIterable(STREAM_EVENTS) });
      await drain(response.data.stream);

      const attrs = attributes(span);
      expect(attrs).not.toHaveProperty(GEN_AI_OUTPUT_MESSAGES);
      expect(attrs).not.toHaveProperty(GEN_AI_RESPONSE_TEXT);
      expect(attrs).not.toHaveProperty(GEN_AI_RESPONSE_TOOL_CALLS);
      expect(attrs).toMatchObject({ [GEN_AI_USAGE_OUTPUT_TOKENS]: 9 });
    });

    it('ends the span when the response has no stream', () => {
      setUpClient();

      const { span } = send('ConverseStream', CONVERSE_INPUT, {});

      expect(span.isRecording()).toBe(false);
    });
  });

  describe('InvokeModel', () => {
    const CLAUDE_BODY = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 100,
      system: 'You are a weather bot.',
      messages: [{ role: 'user', content: 'What is the weather in Vienna?' }],
      tools: [{ name: 'get_weather', description: 'Get the weather', input_schema: { type: 'object' } }],
    };

    const CLAUDE_RESPONSE = {
      id: 'msg_123',
      model: 'claude-3-5-sonnet-20240620',
      content: [
        { type: 'thinking', thinking: 'Call the tool.' },
        { type: 'text', text: 'Let me check.' },
        { type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: { city: 'Vienna' } },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 15, output_tokens: 9, cache_creation_input_tokens: 4, cache_read_input_tokens: 2 },
    };

    it('records Claude request and response content', () => {
      setUpClient();

      const { span } = send(
        'InvokeModel',
        { modelId: CLAUDE, body: JSON.stringify(CLAUDE_BODY) },
        { body: encoder.encode(JSON.stringify(CLAUDE_RESPONSE)) },
      );

      expect(attributes(span)).toMatchObject({
        [GEN_AI_REQUEST_MAX_TOKENS]: 100,
        [GEN_AI_SYSTEM_INSTRUCTIONS]: JSON.stringify([{ type: 'text', content: 'You are a weather bot.' }]),
        [GEN_AI_INPUT_MESSAGES]: JSON.stringify(CLAUDE_BODY.messages),
        [GEN_AI_TOOL_DEFINITIONS]: JSON.stringify(CLAUDE_BODY.tools),
        [GEN_AI_RESPONSE_ID]: 'msg_123',
        [GEN_AI_RESPONSE_MODEL]: 'claude-3-5-sonnet-20240620',
        [GEN_AI_OUTPUT_MESSAGES]: JSON.stringify([
          {
            role: 'assistant',
            parts: [
              { type: 'reasoning', content: 'Call the tool.' },
              { type: 'text', content: 'Let me check.' },
              { type: 'tool_call', id: 'toolu_1', name: 'get_weather', arguments: '{"city":"Vienna"}' },
            ],
            finish_reason: 'tool_use',
          },
        ]),
        [GEN_AI_RESPONSE_FINISH_REASONS]: '["tool_use"]',
        [GEN_AI_USAGE_INPUT_TOKENS]: 21,
        [GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]: 4,
        [GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 2,
        [GEN_AI_USAGE_OUTPUT_TOKENS]: 9,
      });
    });

    it('records Claude image and document blocks as blob parts without their data', () => {
      setUpClient();
      const body = {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this chart?' },
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } },
            ],
          },
          { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_report', input: {} }] },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_1',
                content: [
                  { type: 'text', text: 'The report:' },
                  { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjQ=' } },
                ],
              },
            ],
          },
        ],
      };

      const { span } = send(
        'InvokeModel',
        { modelId: CLAUDE, body: JSON.stringify(body) },
        { body: encoder.encode(JSON.stringify(CLAUDE_RESPONSE)) },
      );

      expect(attributes(span)[GEN_AI_INPUT_MESSAGES]).toBe(
        JSON.stringify([
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this chart?' },
              { type: 'blob', modality: 'image', mime_type: 'image/png' },
            ],
          },
          { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_report', input: {} }] },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_1',
                content: [
                  { type: 'text', text: 'The report:' },
                  { type: 'blob', modality: 'document', mime_type: 'application/pdf' },
                ],
              },
            ],
          },
        ]),
      );
    });

    it('reads a request body passed as bytes', () => {
      setUpClient();

      const { span } = send(
        'InvokeModel',
        { modelId: CLAUDE, body: encoder.encode(JSON.stringify(CLAUDE_BODY)) },
        { body: encoder.encode(JSON.stringify(CLAUDE_RESPONSE)) },
      );

      expect(attributes(span)).toMatchObject({
        [GEN_AI_REQUEST_MAX_TOKENS]: 100,
        [GEN_AI_INPUT_MESSAGES]: JSON.stringify(CLAUDE_BODY.messages),
      });
    });

    it('still names the span when the request body is not JSON', () => {
      setUpClient();

      const { span } = send('InvokeModel', { modelId: CLAUDE, body: 'not json' }, { body: encoder.encode('nope') });

      expect(spanToJSON(span).name).toBe(`generate_content ${CLAUDE}`);
      expect(attributes(span)).not.toHaveProperty(GEN_AI_INPUT_MESSAGES);
    });

    it('records Amazon Nova content, which uses the Converse message shape', () => {
      setUpClient();

      const { span } = send(
        'InvokeModel',
        {
          modelId: 'amazon.nova-pro-v1:0',
          body: JSON.stringify({
            system: [{ text: 'Be brief.' }],
            messages: [{ role: 'user', content: [{ text: 'Hi' }] }],
            inferenceConfig: { max_new_tokens: 50 },
          }),
        },
        {
          body: encoder.encode(
            JSON.stringify({
              output: { message: { role: 'assistant', content: [{ text: 'Hello!' }] } },
              stopReason: 'end_turn',
              usage: { inputTokens: 3, outputTokens: 2 },
            }),
          ),
        },
      );

      expect(attributes(span)).toMatchObject({
        [GEN_AI_REQUEST_MAX_TOKENS]: 50,
        [GEN_AI_SYSTEM_INSTRUCTIONS]: JSON.stringify([{ type: 'text', content: 'Be brief.' }]),
        [GEN_AI_INPUT_MESSAGES]: JSON.stringify([{ role: 'user', parts: [{ type: 'text', content: 'Hi' }] }]),
        [GEN_AI_OUTPUT_MESSAGES]: JSON.stringify([
          { role: 'assistant', parts: [{ type: 'text', content: 'Hello!' }], finish_reason: 'end_turn' },
        ]),
        [GEN_AI_USAGE_INPUT_TOKENS]: 3,
        [GEN_AI_USAGE_OUTPUT_TOKENS]: 2,
      });
    });

    it.each([
      ['amazon.titan-text-express-v1', { inputText: 'Hi' }, { results: [{ outputText: 'Hello!' }] }],
      ['meta.llama3-8b-instruct-v1:0', { prompt: 'Hi' }, { generation: 'Hello!' }],
      ['mistral.mistral-7b-instruct-v0:2', { prompt: 'Hi' }, { outputs: [{ text: 'Hello!' }] }],
      ['cohere.command-text-v14', { prompt: 'Hi' }, { generations: [{ text: 'Hello!' }] }],
      ['cohere.command-r-v1:0', { message: 'Hi' }, { text: 'Hello!' }],
    ])('records the prompt and generated text of %s', (modelId, requestBody, responseBody) => {
      setUpClient();

      const { span } = send(
        'InvokeModel',
        { modelId, body: JSON.stringify(requestBody) },
        { body: encoder.encode(JSON.stringify(responseBody)) },
      );

      expect(attributes(span)).toMatchObject({
        [GEN_AI_INPUT_MESSAGES]: JSON.stringify([{ role: 'user', parts: [{ type: 'text', content: 'Hi' }] }]),
        [GEN_AI_OUTPUT_MESSAGES]: JSON.stringify([{ role: 'assistant', parts: [{ type: 'text', content: 'Hello!' }] }]),
      });
    });

    it('records no content when dataCollection.genAI turns it off', () => {
      setUpClient({ inputs: false, outputs: false });

      const { span } = send(
        'InvokeModel',
        { modelId: CLAUDE, body: JSON.stringify(CLAUDE_BODY) },
        { body: encoder.encode(JSON.stringify(CLAUDE_RESPONSE)) },
      );

      const attrs = attributes(span);
      expect(attrs).not.toHaveProperty(GEN_AI_SYSTEM_INSTRUCTIONS);
      expect(attrs).not.toHaveProperty(GEN_AI_INPUT_MESSAGES);
      expect(attrs).not.toHaveProperty(GEN_AI_TOOL_DEFINITIONS);
      expect(attrs).not.toHaveProperty(GEN_AI_OUTPUT_MESSAGES);
      expect(attrs).toMatchObject({ [GEN_AI_RESPONSE_ID]: 'msg_123', [GEN_AI_USAGE_OUTPUT_TOKENS]: 9 });
    });
  });

  describe('InvokeModelWithResponseStream', () => {
    it('records the final Claude output token count and the streamed content', async () => {
      setUpClient();
      const chunks = [
        invokeModelChunk({
          type: 'message_start',
          message: { id: 'msg_1', model: 'claude-3-5-sonnet-20240620', usage: { input_tokens: 10, output_tokens: 1 } },
        }),
        invokeModelChunk({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
        invokeModelChunk({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi ' } }),
        invokeModelChunk({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'there' } }),
        invokeModelChunk({
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: {} },
        }),
        invokeModelChunk({
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{"city":"Vienna"}' },
        }),
        invokeModelChunk({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 42 } }),
        invokeModelChunk({ type: 'message_stop' }),
      ];

      const { span, response } = send(
        'InvokeModelWithResponseStream',
        { modelId: CLAUDE, body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }) },
        { body: asyncIterable(chunks) },
      );
      await expect(drain(response.data.body)).resolves.toEqual(chunks);

      expect(span.isRecording()).toBe(false);
      expect(attributes(span)).toMatchObject({
        [GEN_AI_RESPONSE_STREAMING]: true,
        [GEN_AI_RESPONSE_ID]: 'msg_1',
        [GEN_AI_RESPONSE_MODEL]: 'claude-3-5-sonnet-20240620',
        [GEN_AI_USAGE_INPUT_TOKENS]: 10,
        [GEN_AI_USAGE_OUTPUT_TOKENS]: 42,
        [GEN_AI_RESPONSE_FINISH_REASONS]: '["tool_use"]',
        [GEN_AI_OUTPUT_MESSAGES]: JSON.stringify([
          {
            role: 'assistant',
            parts: [
              { type: 'text', content: 'Hi there' },
              { type: 'tool_call', id: 'toolu_1', name: 'get_weather', arguments: '{"city":"Vienna"}' },
            ],
            finish_reason: 'tool_use',
          },
        ]),
      });
    });

    it('approximates output tokens from the text of all chunks', async () => {
      setUpClient();
      const chunks = [
        invokeModelChunk({ outputs: [{ text: 'Hello ', stop_reason: null }] }),
        invokeModelChunk({ outputs: [{ text: 'world!', stop_reason: 'stop' }] }),
      ];

      const { span, response } = send(
        'InvokeModelWithResponseStream',
        { modelId: 'mistral.mistral-7b-instruct-v0:2', body: JSON.stringify({ prompt: 'Hi' }) },
        { body: asyncIterable(chunks) },
      );
      await drain(response.data.body);

      expect(attributes(span)).toMatchObject({
        [GEN_AI_USAGE_OUTPUT_TOKENS]: 2,
        [GEN_AI_RESPONSE_FINISH_REASONS]: '["stop"]',
        [GEN_AI_RESPONSE_TEXT]: 'Hello world!',
      });
    });

    it.each([
      {
        modelId: 'cohere.command-r-v1:0',
        body: { message: 'What is the weather like today?' },
        chunks: [{ text: 'Hello ' }, { text: 'world!', finish_reason: 'COMPLETE' }],
      },
      {
        modelId: 'cohere.command-text-v14',
        body: { prompt: 'What is the weather like today?' },
        chunks: [
          { generations: [{ text: 'Hello ' }] },
          { generations: [{ text: 'world!', finish_reason: 'COMPLETE' }] },
        ],
      },
      {
        modelId: 'mistral.mistral-7b-instruct-v0:2',
        body: { prompt: 'What is the weather like today?' },
        chunks: [{ outputs: [{ text: 'Hello ' }] }, { outputs: [{ text: 'world!', stop_reason: 'stop' }] }],
      },
    ])(
      'counts approximated input and output tokens in the total of a $modelId stream',
      async ({ modelId, body, chunks }) => {
        setUpClient();

        const { span, response } = send(
          'InvokeModelWithResponseStream',
          { modelId, body: JSON.stringify(body) },
          { body: asyncIterable(chunks.map(invokeModelChunk)) },
        );
        await drain(response.data.body);

        expect(attributes(span)).toMatchObject({
          [GEN_AI_USAGE_INPUT_TOKENS]: 6,
          [GEN_AI_USAGE_OUTPUT_TOKENS]: 2,
          [GEN_AI_USAGE_TOTAL_TOKENS]: 8,
        });
      },
    );

    it.each([
      { modelId: CLAUDE, reads: 1 },
      { modelId: 'mistral.mistral-7b-instruct-v0:2', reads: 2 },
    ])('reads the request body $reads time(s) for a $modelId stream', async ({ modelId, reads }) => {
      setUpClient();
      let bodyReads = 0;
      const commandInput = {
        modelId,
        get body() {
          bodyReads++;
          return JSON.stringify({ prompt: 'Hi', messages: [{ role: 'user', content: 'Hi' }] });
        },
      };

      const { response } = send('InvokeModelWithResponseStream', commandInput, { body: asyncIterable([]) });
      await drain(response.data.body);

      expect(bodyReads).toBe(reads);
    });

    it('buffers no streamed content when dataCollection.genAI.outputs is off', async () => {
      setUpClient({ outputs: false });
      const chunks = [
        invokeModelChunk({ outputs: [{ text: 'Hello ', stop_reason: null }] }),
        invokeModelChunk({ outputs: [{ text: 'world!', stop_reason: 'stop' }] }),
      ];

      const { span, response } = send(
        'InvokeModelWithResponseStream',
        { modelId: 'mistral.mistral-7b-instruct-v0:2', body: JSON.stringify({ prompt: 'Hi' }) },
        { body: asyncIterable(chunks) },
      );
      await expect(drain(response.data.body)).resolves.toEqual(chunks);

      const attrs = attributes(span);
      expect(attrs).toMatchObject({ [GEN_AI_USAGE_OUTPUT_TOKENS]: 2, [GEN_AI_RESPONSE_FINISH_REASONS]: '["stop"]' });
      expect(attrs).not.toHaveProperty(GEN_AI_OUTPUT_MESSAGES);
      expect(attrs).not.toHaveProperty(GEN_AI_RESPONSE_TEXT);
    });

    it('ends the span for a model family it cannot read', async () => {
      setUpClient();
      const chunks = [invokeModelChunk({ unknown: true })];

      const { span, response } = send(
        'InvokeModelWithResponseStream',
        { modelId: 'some.other-model', body: '{}' },
        { body: asyncIterable(chunks) },
      );
      await expect(drain(response.data.body)).resolves.toEqual(chunks);

      expect(span.isRecording()).toBe(false);
    });
  });

  describe('instrumentBedrockStream', () => {
    it.each([true, false])('buffers streamed content only when recordOutputs is %s', async recordOutputs => {
      setUpClient();
      let state: BedrockStreamState | undefined;
      const span = startInactiveSpan({ name: 'stream' });

      await drain(
        instrumentBedrockStream(asyncIterable(['Hi']), span, recordOutputs, (text, streamState) => {
          state = streamState;
          appendStreamBlock(streamState, 0, 'text', text);
          startStreamToolCall(streamState, 1, 'toolu_1', 'get_weather');
          appendStreamBlock(streamState, 1, 'tool_call', '{}');
        }),
      );

      expect(state?.blocks.size).toBe(recordOutputs ? 2 : 0);
    });
  });
});
