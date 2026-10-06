import { describe, expect, it } from 'vitest';
import type { Span } from '@sentry/core';
import {
  GEN_AI_PROVIDER_NAME,
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_REQUEST_FREQUENCY_PENALTY,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_PRESENCE_PENALTY,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_K,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_REQUEST_STREAM_ATTRIBUTE } from '../../../../src/ai/core/gen-ai-attributes';
import { WORKERS_AI_ORIGIN, WORKERS_AI_PROVIDER_NAME } from '../../../../src/ai/workers-ai/constants';
import {
  addRequestAttributes,
  addResponseAttributes,
  extractRequestAttributes,
  getOperationName,
} from '../../../../src/ai/workers-ai/utils';

const MODEL = '@cf/meta/llama-3.1-8b-instruct';

function createMockSpan(): { span: Span; attributes: Record<string, unknown> } {
  const attributes: Record<string, unknown> = {};
  const span = {
    setAttribute: (key: string, value: unknown) => {
      attributes[key] = value;
    },
    setAttributes: (attrs: Record<string, unknown>) => {
      Object.assign(attributes, attrs);
    },
  } as unknown as Span;
  return { span, attributes };
}

describe('workers-ai utils', () => {
  describe('getOperationName', () => {
    it('returns "chat" for prompt inputs', () => {
      expect(getOperationName(MODEL, { prompt: 'Hello' })).toBe('chat');
    });

    it('returns "chat" for messages inputs', () => {
      expect(getOperationName(MODEL, { messages: [{ role: 'user', content: 'Hi' }] })).toBe('chat');
    });

    it('returns "embeddings" for text inputs', () => {
      expect(getOperationName(MODEL, { text: 'embed me' })).toBe('embeddings');
    });

    it('returns "evaluate" for TypeSafe Jev models', () => {
      expect(getOperationName('typesafe/jev', { state: 'Help!', questions: {} })).toBe('evaluate');
      expect(getOperationName('typesafe/jev-1.13', { state: 'Help!', questions: {} })).toBe('evaluate');
    });

    it('does not return "evaluate" for other TypeSafe models', () => {
      expect(getOperationName('typesafe/other', { prompt: 'Hello' })).toBe('chat');
    });

    it('does not return "evaluate" for other models with state and questions inputs', () => {
      expect(getOperationName(MODEL, { state: 'Help!', questions: {} })).toBe('chat');
    });

    it('prefers "chat" when both messages and text are present', () => {
      expect(getOperationName(MODEL, { messages: [{ role: 'user', content: 'Hi' }], text: 'embed me' })).toBe('chat');
    });

    it('falls back to "chat" for null, undefined and empty inputs', () => {
      expect(getOperationName(MODEL, null)).toBe('chat');
      expect(getOperationName(MODEL, undefined)).toBe('chat');
      expect(getOperationName(MODEL, {})).toBe('chat');
    });
  });

  describe('extractRequestAttributes', () => {
    it('sets exactly the base attributes for a minimal request', () => {
      expect(extractRequestAttributes(MODEL, { prompt: 'Hello' }, 'chat')).toEqual({
        [GEN_AI_PROVIDER_NAME]: WORKERS_AI_PROVIDER_NAME,
        [GEN_AI_OPERATION_NAME]: 'chat',
        [SENTRY_ORIGIN]: WORKERS_AI_ORIGIN,
        [GEN_AI_REQUEST_MODEL]: MODEL,
      });
    });

    it('maps all supported request parameters', () => {
      expect(
        extractRequestAttributes(
          MODEL,
          {
            prompt: 'Hello',
            temperature: 0.5,
            max_tokens: 100,
            top_p: 0.9,
            top_k: 40,
            frequency_penalty: 0.1,
            presence_penalty: 0.2,
            stream: true,
          },
          'chat',
        ),
      ).toEqual({
        [GEN_AI_PROVIDER_NAME]: WORKERS_AI_PROVIDER_NAME,
        [GEN_AI_OPERATION_NAME]: 'chat',
        [SENTRY_ORIGIN]: WORKERS_AI_ORIGIN,
        [GEN_AI_REQUEST_MODEL]: MODEL,
        [GEN_AI_REQUEST_TEMPERATURE]: 0.5,
        [GEN_AI_REQUEST_MAX_TOKENS]: 100,
        [GEN_AI_REQUEST_TOP_P]: 0.9,
        [GEN_AI_REQUEST_TOP_K]: 40,
        [GEN_AI_REQUEST_FREQUENCY_PENALTY]: 0.1,
        [GEN_AI_REQUEST_PRESENCE_PENALTY]: 0.2,
        [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
      });
    });

    it('does not set the stream attribute when stream is false', () => {
      const attrs = extractRequestAttributes(MODEL, { prompt: 'Hello', stream: false }, 'chat');
      expect(attrs[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
    });

    it('falls back to "unknown" model when model is not a string', () => {
      const attrs = extractRequestAttributes(undefined, { prompt: 'Hello' }, 'chat');
      expect(attrs[GEN_AI_REQUEST_MODEL]).toBe('unknown');
    });
  });

  describe('addRequestAttributes', () => {
    it('records messages and extracts system instructions', () => {
      const { span, attributes } = createMockSpan();

      addRequestAttributes(
        span,
        {
          messages: [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hi' },
          ],
        },
        'chat',
      );

      expect(attributes[GEN_AI_SYSTEM_INSTRUCTIONS]).toBe(
        JSON.stringify([{ type: 'text', content: 'You are helpful.' }]),
      );
      expect(attributes[GEN_AI_INPUT_MESSAGES]).toBe(JSON.stringify([{ role: 'user', content: 'Hi' }]));
    });

    it('records the prompt string directly', () => {
      const { span, attributes } = createMockSpan();

      addRequestAttributes(span, { prompt: 'Hello world' }, 'chat');

      expect(attributes[GEN_AI_INPUT_MESSAGES]).toBe('Hello world');
    });

    it('records embeddings input on a dedicated attribute', () => {
      const { span, attributes } = createMockSpan();

      addRequestAttributes(span, { text: ['embed a', 'embed b'] }, 'embeddings');

      expect(attributes).toEqual({ [GEN_AI_EMBEDDINGS_INPUT]: JSON.stringify(['embed a', 'embed b']) });
    });

    it('records nothing for an empty messages array', () => {
      const { span, attributes } = createMockSpan();

      addRequestAttributes(span, { messages: [] }, 'chat');

      expect(attributes).toEqual({});
    });

    it('records nothing for empty embeddings input', () => {
      const { span, attributes } = createMockSpan();

      addRequestAttributes(span, { text: '' }, 'embeddings');

      expect(attributes).toEqual({});
    });

    it('records nothing when inputs are missing', () => {
      const { span, attributes } = createMockSpan();

      addRequestAttributes(span, undefined, 'chat');

      expect(attributes).toEqual({});
    });
  });

  describe('addResponseAttributes', () => {
    it.each([
      { name: 'wrapped in { state, result }', wrap: (body: object) => ({ state: 'Completed', result: body }) },
      { name: 'unwrapped', wrap: (body: object) => body },
    ])('records evaluate responses $name', ({ wrap }) => {
      const { span, attributes } = createMockSpan();
      const answers = { is_urgent: { type: 'noul', noul: 0.95 } };

      addResponseAttributes(
        span,
        wrap({ model: 'jev-1.13.0', answers, usage: { input_tokens: 366, output_tokens: 50 } }),
        true,
        'evaluate',
      );

      expect(attributes).toEqual({
        [GEN_AI_RESPONSE_MODEL]: 'jev-1.13.0',
        [GEN_AI_USAGE_INPUT_TOKENS]: 366,
        [GEN_AI_USAGE_OUTPUT_TOKENS]: 50,
        [GEN_AI_USAGE_TOTAL_TOKENS]: 416,
        [GEN_AI_OUTPUT_MESSAGES]: JSON.stringify([{ type: 'evaluation', answers }]),
      });
    });

    it('sets token usage and computes the total from input and output tokens', () => {
      const { span, attributes } = createMockSpan();

      addResponseAttributes(span, { response: 'Paris', usage: { prompt_tokens: 12, completion_tokens: 7 } }, false);

      expect(attributes).toEqual({
        [GEN_AI_USAGE_INPUT_TOKENS]: 12,
        [GEN_AI_USAGE_OUTPUT_TOKENS]: 7,
        [GEN_AI_USAGE_TOTAL_TOKENS]: 19,
      });
    });

    it('does not record response text when recordOutputs is false', () => {
      const { span, attributes } = createMockSpan();

      addResponseAttributes(span, { response: 'Paris' }, false);

      expect(attributes[GEN_AI_RESPONSE_TEXT]).toBeUndefined();
    });

    it('records response text when recordOutputs is true', () => {
      const { span, attributes } = createMockSpan();

      addResponseAttributes(span, { response: 'Paris' }, true);

      expect(attributes[GEN_AI_RESPONSE_TEXT]).toBe('Paris');
      expect(attributes[GEN_AI_OUTPUT_MESSAGES]).toBe(
        JSON.stringify([{ role: 'assistant', parts: [{ type: 'text', content: 'Paris' }] }]),
      );
    });

    it('records tool calls when recordOutputs is true', () => {
      const { span, attributes } = createMockSpan();
      const toolCalls = [{ id: 'call_1', name: 'lookup', arguments: { city: 'Paris' } }];

      addResponseAttributes(span, { tool_calls: toolCalls }, true);

      expect(attributes[GEN_AI_RESPONSE_TOOL_CALLS]).toBe(JSON.stringify(toolCalls));
      // The product reads model output from `gen_ai.output.messages`; tool calls must appear there too.
      expect(attributes[GEN_AI_OUTPUT_MESSAGES]).toBe(
        JSON.stringify([
          {
            role: 'assistant',
            parts: [{ type: 'tool_call', id: 'call_1', name: 'lookup', arguments: JSON.stringify({ city: 'Paris' }) }],
          },
        ]),
      );
    });

    it('normalizes OpenAI-compatible tool calls (name/arguments nested under function) into output messages', () => {
      const { span, attributes } = createMockSpan();
      const toolCalls = [
        { id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"city":"Paris"}' } },
      ];

      addResponseAttributes(span, { tool_calls: toolCalls }, true);

      expect(attributes[GEN_AI_OUTPUT_MESSAGES]).toBe(
        JSON.stringify([
          {
            role: 'assistant',
            parts: [{ type: 'tool_call', id: 'call_1', name: 'lookup', arguments: '{"city":"Paris"}' }],
          },
        ]),
      );
    });

    it('records both response text and tool calls without overwriting each other', () => {
      const { span, attributes } = createMockSpan();
      const toolCalls = [{ id: 'call_1', name: 'lookup', arguments: { city: 'Paris' } }];

      addResponseAttributes(span, { response: 'Looking that up', tool_calls: toolCalls }, true);

      expect(attributes[GEN_AI_RESPONSE_TEXT]).toBe('Looking that up');
      expect(attributes[GEN_AI_RESPONSE_TOOL_CALLS]).toBe(JSON.stringify(toolCalls));
      expect(attributes[GEN_AI_OUTPUT_MESSAGES]).toBe(
        JSON.stringify([
          {
            role: 'assistant',
            parts: [
              { type: 'text', content: 'Looking that up' },
              { type: 'tool_call', id: 'call_1', name: 'lookup', arguments: JSON.stringify({ city: 'Paris' }) },
            ],
          },
        ]),
      );
    });

    it('does not set output messages when recordOutputs is false', () => {
      const { span, attributes } = createMockSpan();

      addResponseAttributes(span, { response: 'Paris', tool_calls: [{ name: 'lookup' }] }, false);

      expect(attributes[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
    });

    it('serializes non-string response payloads as JSON', () => {
      const { span, attributes } = createMockSpan();

      addResponseAttributes(span, { response: { translated_text: 'Bonjour' } }, true);

      expect(attributes[GEN_AI_RESPONSE_TEXT]).toBe(JSON.stringify({ translated_text: 'Bonjour' }));
    });

    it('ignores raw Response objects', () => {
      const { span, attributes } = createMockSpan();

      addResponseAttributes(span, new Response('raw'), true);

      expect(attributes).toEqual({});
    });

    it('ignores non-object results', () => {
      const { span, attributes } = createMockSpan();

      addResponseAttributes(span, null, true);

      expect(attributes).toEqual({});
    });
  });
});
