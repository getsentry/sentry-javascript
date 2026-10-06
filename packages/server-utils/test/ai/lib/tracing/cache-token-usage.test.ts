import { describe, expect, it } from 'vitest';
import type { Span } from '@sentry/core';
import { addResponseAttributes as addOpenAiResponseAttributes } from '../../../../src/ai/openai/utils';
import { instrumentStream as instrumentOpenAiStream } from '../../../../src/ai/openai/streaming';
import { addResponseAttributes as addGoogleResponseAttributes } from '../../../../src/ai/google-genai';
import { instrumentStream as instrumentGoogleStream } from '../../../../src/ai/google-genai/streaming';

describe.each(['openai chat', 'openai responses', 'google'] as const)('cache usage (%s)', provider => {
  describe.each(['response', 'stream'] as const)('%s', mode => {
    it.each([
      { name: 'records cache subsets without increasing input or total tokens', cacheRead: 2048, cacheWrite: 512 },
      { name: 'preserves zero cache counts', cacheRead: 0, cacheWrite: 0 },
      { name: 'omits cache attributes when details are absent', cacheRead: undefined, cacheWrite: undefined },
    ])('$name', async ({ cacheRead, cacheWrite }) => {
      const attributes: Record<string, unknown> = {};
      const span = {
        isRecording: () => true,
        setAttributes: (values: Record<string, unknown>) => Object.assign(attributes, values),
        setAttribute: (key: string, value: unknown) => {
          attributes[key] = value;
        },
        end: () => {},
      } as unknown as Span;
      const details =
        cacheRead === undefined ? undefined : { cached_tokens: cacheRead, cache_write_tokens: cacheWrite };
      const openAiResponse = {
        id: 'response_cache_usage',
        model: 'gpt-4o',
        choices: [],
        usage:
          provider === 'openai chat'
            ? { prompt_tokens: 2600, completion_tokens: 120, total_tokens: 2720, prompt_tokens_details: details }
            : { input_tokens: 2600, output_tokens: 120, total_tokens: 2720, input_tokens_details: details },
      };
      const googleResponse = {
        usageMetadata: {
          promptTokenCount: 2600,
          candidatesTokenCount: 120,
          totalTokenCount: 2720,
          cachedContentTokenCount: cacheRead,
        },
      };

      if (mode === 'response') {
        if (provider === 'google') {
          addGoogleResponseAttributes(span, googleResponse, false);
        } else {
          addOpenAiResponseAttributes(span, openAiResponse, false);
        }
      } else if (provider === 'google') {
        const stream = (async function* () {
          yield googleResponse;
          yield googleResponse;
          yield {};
        })();
        for await (const _ of instrumentGoogleStream(stream, span, false)) {
          void _;
        }
      } else {
        const event =
          provider === 'openai chat'
            ? { ...openAiResponse, object: 'chat.completion.chunk' }
            : { type: 'response.completed', response: openAiResponse };
        const responseWithoutCacheDetails = {
          ...openAiResponse,
          usage: { ...openAiResponse.usage, prompt_tokens_details: undefined, input_tokens_details: undefined },
        };
        const stream = (async function* () {
          yield event;
          yield event;
          yield provider === 'openai chat'
            ? { ...responseWithoutCacheDetails, object: 'chat.completion.chunk' }
            : { type: 'response.completed', response: responseWithoutCacheDetails };
        })();
        for await (const _ of instrumentOpenAiStream(stream, span, false)) {
          void _;
        }
      }

      expect(attributes).toEqual({
        'gen_ai.usage.input_tokens': 2600,
        'gen_ai.usage.output_tokens': 120,
        'gen_ai.usage.total_tokens': 2720,
        ...(cacheRead === undefined ? {} : { 'gen_ai.usage.cache_read.input_tokens': cacheRead }),
        ...(provider === 'google' || cacheWrite === undefined
          ? {}
          : { 'gen_ai.usage.cache_creation.input_tokens': cacheWrite }),
        ...(provider === 'google'
          ? {}
          : { 'gen_ai.response.id': 'response_cache_usage', 'gen_ai.response.model': 'gpt-4o' }),
        ...(mode === 'response' ? {} : { 'gen_ai.response.streaming': true }),
      });
    });
  });
});

describe.each(['response', 'stream'] as const)('Google reasoning usage (%s)', mode => {
  it.each([
    {
      name: 'includes reasoning in output',
      candidates: 120,
      thoughts: 80,
      total: 2800,
      output: 200,
      expectedTotal: 2800,
    },
    {
      name: 'computes a total including reasoning',
      candidates: 120,
      thoughts: 80,
      total: undefined,
      output: 200,
      expectedTotal: 2800,
    },
    {
      name: 'preserves zero reasoning usage',
      candidates: 120,
      thoughts: 0,
      total: 2720,
      output: 120,
      expectedTotal: 2720,
    },
    {
      name: 'records reasoning without response candidates',
      candidates: undefined,
      thoughts: 80,
      total: 2680,
      output: 80,
      expectedTotal: 2680,
    },
  ])('$name', async ({ candidates, thoughts, total, output, expectedTotal }) => {
    const attributes: Record<string, unknown> = {};
    const span = {
      isRecording: () => true,
      setAttributes: (values: Record<string, unknown>) => Object.assign(attributes, values),
      setAttribute: (key: string, value: unknown) => {
        attributes[key] = value;
      },
      end: () => {},
    } as unknown as Span;
    const response = {
      usageMetadata: {
        promptTokenCount: 2600,
        cachedContentTokenCount: 2048,
        candidatesTokenCount: candidates,
        thoughtsTokenCount: thoughts,
        totalTokenCount: total,
      },
    };

    if (mode === 'response') {
      addGoogleResponseAttributes(span, response, false);
    } else {
      const stream = (async function* () {
        yield { usageMetadata: { candidatesTokenCount: candidates } };
        yield { usageMetadata: { thoughtsTokenCount: thoughts } };
        yield response;
        yield response;
        yield {};
      })();
      for await (const _ of instrumentGoogleStream(stream, span, false)) {
        void _;
      }
    }

    expect(attributes).toEqual({
      'gen_ai.usage.input_tokens': 2600,
      'gen_ai.usage.cache_read.input_tokens': 2048,
      'gen_ai.usage.output_tokens': output,
      'gen_ai.usage.reasoning.output_tokens': thoughts,
      'gen_ai.usage.total_tokens': expectedTotal,
      ...(mode === 'stream' ? { 'gen_ai.response.streaming': true } : {}),
    });
  });
});
