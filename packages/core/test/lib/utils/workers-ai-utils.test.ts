import { describe, expect, it } from 'vitest';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../../src';
import type { Span } from '../../../src';
import {
  GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_K_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../src/tracing/ai/gen-ai-attributes';
import { WORKERS_AI_ORIGIN, WORKERS_AI_SYSTEM_NAME } from '../../../src/tracing/workers-ai/constants';
import {
  addRequestAttributes,
  addResponseAttributes,
  extractRequestAttributes,
  getOperationName,
} from '../../../src/tracing/workers-ai/utils';

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
      expect(getOperationName({ prompt: 'Hello' })).toBe('chat');
    });

    it('returns "chat" for messages inputs', () => {
      expect(getOperationName({ messages: [{ role: 'user', content: 'Hi' }] })).toBe('chat');
    });

    it('returns "embeddings" for text inputs', () => {
      expect(getOperationName({ text: 'embed me' })).toBe('embeddings');
    });

    it('prefers "chat" when both messages and text are present', () => {
      expect(getOperationName({ messages: [{ role: 'user', content: 'Hi' }], text: 'embed me' })).toBe('chat');
    });

    it('falls back to "chat" for null, undefined and empty inputs', () => {
      expect(getOperationName(null)).toBe('chat');
      expect(getOperationName(undefined)).toBe('chat');
      expect(getOperationName({})).toBe('chat');
    });
  });

  describe('extractRequestAttributes', () => {
    it('sets exactly the base attributes for a minimal request', () => {
      expect(extractRequestAttributes(MODEL, { prompt: 'Hello' }, 'chat')).toEqual({
        [GEN_AI_SYSTEM_ATTRIBUTE]: WORKERS_AI_SYSTEM_NAME,
        [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: WORKERS_AI_ORIGIN,
        [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: MODEL,
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
        [GEN_AI_SYSTEM_ATTRIBUTE]: WORKERS_AI_SYSTEM_NAME,
        [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: WORKERS_AI_ORIGIN,
        [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: MODEL,
        [GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE]: 0.5,
        [GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE]: 100,
        [GEN_AI_REQUEST_TOP_P_ATTRIBUTE]: 0.9,
        [GEN_AI_REQUEST_TOP_K_ATTRIBUTE]: 40,
        [GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE]: 0.1,
        [GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE]: 0.2,
        [GEN_AI_REQUEST_STREAM_ATTRIBUTE]: true,
      });
    });

    it('does not set the stream attribute when stream is false', () => {
      const attrs = extractRequestAttributes(MODEL, { prompt: 'Hello', stream: false }, 'chat');
      expect(attrs[GEN_AI_REQUEST_STREAM_ATTRIBUTE]).toBeUndefined();
    });

    it('falls back to "unknown" model when model is not a string', () => {
      const attrs = extractRequestAttributes(undefined, { prompt: 'Hello' }, 'chat');
      expect(attrs[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toBe('unknown');
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
        false,
      );

      expect(attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toBe(
        JSON.stringify([{ type: 'text', content: 'You are helpful.' }]),
      );
      expect(attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBe(JSON.stringify([{ role: 'user', content: 'Hi' }]));
    });

    it('records the prompt string directly', () => {
      const { span, attributes } = createMockSpan();

      addRequestAttributes(span, { prompt: 'Hello world' }, 'chat', false);

      expect(attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBe('Hello world');
    });

    it('records embeddings input on a dedicated attribute', () => {
      const { span, attributes } = createMockSpan();

      addRequestAttributes(span, { text: ['embed a', 'embed b'] }, 'embeddings', false);

      expect(attributes).toEqual({ [GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]: JSON.stringify(['embed a', 'embed b']) });
    });

    it('records nothing for an empty messages array', () => {
      const { span, attributes } = createMockSpan();

      addRequestAttributes(span, { messages: [] }, 'chat', false);

      expect(attributes).toEqual({});
    });

    it('records nothing for empty embeddings input', () => {
      const { span, attributes } = createMockSpan();

      addRequestAttributes(span, { text: '' }, 'embeddings', false);

      expect(attributes).toEqual({});
    });

    it('records nothing when inputs are missing', () => {
      const { span, attributes } = createMockSpan();

      addRequestAttributes(span, undefined, 'chat', false);

      expect(attributes).toEqual({});
    });
  });

  describe('addResponseAttributes', () => {
    it('sets token usage and computes the total from input and output tokens', () => {
      const { span, attributes } = createMockSpan();

      addResponseAttributes(span, { response: 'Paris', usage: { prompt_tokens: 12, completion_tokens: 7 } }, false);

      expect(attributes).toEqual({
        [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 12,
        [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 7,
        [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 19,
      });
    });

    it('does not record response text when recordOutputs is false', () => {
      const { span, attributes } = createMockSpan();

      addResponseAttributes(span, { response: 'Paris' }, false);

      expect(attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeUndefined();
    });

    it('records response text and tool calls when recordOutputs is true', () => {
      const { span, attributes } = createMockSpan();
      const toolCalls = [{ name: 'lookup', arguments: { city: 'Paris' } }];

      addResponseAttributes(span, { response: 'Paris', tool_calls: toolCalls }, true);

      expect(attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBe('Paris');
      expect(attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]).toBe(JSON.stringify(toolCalls));
    });

    it('serializes non-string response payloads as JSON', () => {
      const { span, attributes } = createMockSpan();

      addResponseAttributes(span, { response: { translated_text: 'Bonjour' } }, true);

      expect(attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBe(JSON.stringify({ translated_text: 'Bonjour' }));
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
