import type * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/core', async importOriginal => {
  const actual = (await importOriginal()) as typeof SentryCore;
  return { ...actual, captureException: vi.fn() };
});

import { captureException } from '@sentry/core';
import { instrumentAnthropicAiClient } from '../../../src/ai/anthropic-ai';
import { instrumentGoogleGenAIClient } from '../../../src/ai/google-genai';
import { instrumentOpenAiClient } from '../../../src/ai/openai';

const upstreamError = new Error('Rate limit exceeded');

/** Rejects on the first call and resolves afterwards, like a transient provider failure. */
function transientFailure(response: unknown): (...args: unknown[]) => Promise<unknown> {
  let call = 0;
  return () => (call++ === 0 ? Promise.reject(upstreamError) : Promise.resolve(response));
}

const openAiResponse = {
  id: 'chatcmpl-1',
  model: 'gpt-4o-mini',
  object: 'chat.completion',
  choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
};

const anthropicResponse = { id: 'msg_1', model: 'claude-sonnet-4-5', type: 'message', content: [], usage: {} };

const googleResponse = { modelVersion: 'gemini-2.0-flash', candidates: [], usageMetadata: {} };

describe('AI client instrumentation error handling', () => {
  beforeEach(() => {
    vi.mocked(captureException).mockClear();
  });

  describe.each([
    {
      provider: 'openai',
      instrument: () => {
        const create = transientFailure(openAiResponse);
        const client = instrumentOpenAiClient({ chat: { completions: { create } } });
        return () => client.chat.completions.create({ model: 'gpt-4o-mini', messages: [] });
      },
    },
    {
      provider: 'openai (streaming)',
      instrument: () => {
        const create = transientFailure(openAiResponse);
        const client = instrumentOpenAiClient({ chat: { completions: { create } } });
        return () => client.chat.completions.create({ model: 'gpt-4o-mini', messages: [], stream: true });
      },
    },
    {
      provider: 'anthropic',
      instrument: () => {
        const create = transientFailure(anthropicResponse);
        const client = instrumentAnthropicAiClient({ messages: { create } });
        return () => client.messages.create({ model: 'claude-sonnet-4-5', messages: [] });
      },
    },
    {
      provider: 'anthropic (streaming)',
      instrument: () => {
        const create = transientFailure(anthropicResponse);
        const client = instrumentAnthropicAiClient({ messages: { create } });
        return () => client.messages.create({ model: 'claude-sonnet-4-5', messages: [], stream: true });
      },
    },
    {
      provider: 'google-genai',
      instrument: () => {
        const generateContent = transientFailure(googleResponse);
        const client = instrumentGoogleGenAIClient({ models: { generateContent } });
        return () => client.models.generateContent({ model: 'gemini-2.0-flash', contents: 'hi' });
      },
    },
    {
      provider: 'google-genai (streaming)',
      instrument: () => {
        const generateContentStream = transientFailure(googleResponse);
        const client = instrumentGoogleGenAIClient({ models: { generateContentStream } });
        return () => client.models.generateContentStream({ model: 'gemini-2.0-flash', contents: 'hi' });
      },
    },
  ])('$provider', ({ instrument }) => {
    it('rethrows the original error without capturing it', async () => {
      const call = instrument();

      await expect(call()).rejects.toBe(upstreamError);
      expect(captureException).not.toHaveBeenCalled();
    });

    it('reports nothing when a retry recovers the call', async () => {
      const call = instrument();

      await expect(call()).rejects.toBe(upstreamError);
      await expect(call()).resolves.toBeDefined();

      expect(captureException).not.toHaveBeenCalled();
    });

    it('reports nothing per attempt when every retry fails', async () => {
      // `transientFailure` only rejects its first call, so re-instrument per attempt to model
      // a caller that retries the same failing request three times.
      for (let attempt = 0; attempt < 3; attempt++) {
        await expect(instrument()()).rejects.toBe(upstreamError);
      }

      expect(captureException).not.toHaveBeenCalled();
    });
  });

  it('does not capture when a rejection is observed through .withResponse()', async () => {
    const create = (..._args: unknown[]): Promise<unknown> => {
      const promise = Promise.reject(upstreamError) as Promise<unknown> & { withResponse: () => Promise<unknown> };
      promise.withResponse = () => Promise.reject(upstreamError);
      return promise;
    };
    const client = instrumentOpenAiClient({ chat: { completions: { create } } });

    const result = client.chat.completions.create({ model: 'gpt-4o-mini', messages: [] }) as Promise<unknown> & {
      withResponse: () => Promise<unknown>;
    };

    await expect(result).rejects.toBe(upstreamError);
    await expect(result.withResponse()).rejects.toBe(upstreamError);

    expect(captureException).not.toHaveBeenCalled();
  });
});
