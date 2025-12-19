import { describe, expect, it } from 'vitest';
import { addVercelAiProcessors } from '../../../src/tracing/vercel-ai';
import { convertPromptToMessages } from '../../../src/tracing/vercel-ai/utils';
import type { Client } from '../../../src/client';
import type { Event } from '../../../src/types-hoist/event';

describe('vercel-ai-utils', () => {
  describe('convertPromptToMessages', () => {
    it('should convert a prompt with system to a messages array', () => {
      expect(
        convertPromptToMessages(
          JSON.stringify({
            system: 'You are a friendly robot',
            prompt: 'Hello, robot',
          }),
        ),
      ).toStrictEqual([
        { role: 'system', content: 'You are a friendly robot' },
        { role: 'user', content: 'Hello, robot' },
      ]);
    });

    it('should convert a system prompt to a messages array', () => {
      expect(
        convertPromptToMessages(
          JSON.stringify({
            system: 'You are a friendly robot',
          }),
        ),
      ).toStrictEqual([{ role: 'system', content: 'You are a friendly robot' }]);
    });

    it('should convert a user only prompt to a messages array', () => {
      expect(
        convertPromptToMessages(
          JSON.stringify({
            prompt: 'Hello, robot',
          }),
        ),
      ).toStrictEqual([{ role: 'user', content: 'Hello, robot' }]);
    });

    it('should ignore unexpected data', () => {
      expect(
        convertPromptToMessages(
          JSON.stringify({
            randomField: 'Hello, robot',
            nothing: 'that we know how to handle',
          }),
        ),
      ).toStrictEqual([]);
    });

    it('should not break on invalid json', () => {
      expect(convertPromptToMessages('this is not json')).toStrictEqual([]);
    });
  });

  describe('token accounting via event processor', () => {
    function getProcessor(): (e: Event) => Event {
      let captured: ((e: Event) => Event) | undefined;
      const client = {
        on: () => {},
        addEventProcessor: (fn: (e: Event) => Event) => {
          captured = fn;
        },
      } as unknown as Client;

      addVercelAiProcessors(client);
      if (!captured) {
        throw new Error('event processor not registered');
      }
      return captured;
    }

    it('adds cached input tokens to gen_ai.usage.input_tokens and recalculates total_tokens', () => {
      const processor = getProcessor();

      const event: Event = {
        type: 'transaction',
        contexts: {
          trace: {
            span_id: 'root',
            trace_id: 'trace',
            op: 'gen_ai.invoke_agent',
          },
        },
        spans: [
          {
            span_id: 'child',
            parent_span_id: 'root',
            start_timestamp: 0,
            trace_id: 'trace',
            origin: 'auto.vercelai.otel',
            op: 'gen_ai.generate_text',
            data: {
              'ai.usage.promptTokens': 100,
              'ai.usage.cachedInputTokens': 30,
              'ai.usage.completionTokens': 50,
            },
          },
        ],
      };

      const processed = processor(event);
      const span = processed.spans?.[0];
      if (!span) {
        throw new Error('expected span');
      }

      expect(span.data['gen_ai.usage.input_tokens.cached']).toBe(30);
      expect(span.data['gen_ai.usage.output_tokens']).toBe(50);
      expect(span.data['gen_ai.usage.input_tokens']).toBe(130);
      expect(span.data['gen_ai.usage.total_tokens']).toBe(180);
    });

    it('uses cached tokens as input_tokens when base input is missing', () => {
      const processor = getProcessor();

      const event: Event = {
        type: 'transaction',
        contexts: {
          trace: {
            span_id: 'root',
            trace_id: 'trace',
            op: 'gen_ai.invoke_agent',
          },
        },
        spans: [
          {
            span_id: 'child',
            parent_span_id: 'root',
            start_timestamp: 0,
            trace_id: 'trace',
            origin: 'auto.vercelai.otel',
            op: 'gen_ai.generate_text',
            data: {
              'ai.usage.cachedInputTokens': 12,
              'ai.usage.completionTokens': 8,
            },
          },
        ],
      };

      const processed = processor(event);
      const span = processed.spans?.[0];
      if (!span) {
        throw new Error('expected span');
      }

      expect(span.data['gen_ai.usage.input_tokens.cached']).toBe(12);
      expect(span.data['gen_ai.usage.input_tokens']).toBe(12);
      expect(span.data['gen_ai.usage.output_tokens']).toBe(8);
      expect(span.data['gen_ai.usage.total_tokens']).toBe(20);
    });
  });
});
