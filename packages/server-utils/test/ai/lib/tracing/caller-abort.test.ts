import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import { instrumentAnthropicAiClient } from '../../../../src/ai/anthropic-ai';
import { instrumentGoogleGenAIClient } from '../../../../src/ai/google-genai';
import { instrumentMistralAiClient } from '../../../../src/ai/mistral';
import { instrumentOpenAiClient } from '../../../../src/ai/openai';
import { instrumentWorkersAiClient } from '../../../../src/ai/workers-ai';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

type Call = (signal: AbortSignal, stream: boolean) => Promise<unknown>;

// Each provider's SDK rejects with an `AbortError` for both a caller abort and its own timeout.
function rejectingMethod(): ReturnType<typeof vi.fn> {
  return vi.fn().mockRejectedValue(new DOMException('This operation was aborted', 'AbortError'));
}

const providers: Array<{ name: string; call: () => Call }> = [
  {
    name: 'openai',
    call: () => {
      const client = instrumentOpenAiClient({ chat: { completions: { create: rejectingMethod() } } });
      return (signal, stream) => client.chat.completions.create({ model: 'gpt-4o', messages: [], stream }, { signal });
    },
  },
  {
    name: 'anthropic',
    call: () => {
      const client = instrumentAnthropicAiClient({ messages: { create: rejectingMethod() } });
      return (signal, stream) =>
        client.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 10, messages: [], stream }, { signal });
    },
  },
  {
    name: 'google-genai',
    call: () => {
      const client = instrumentGoogleGenAIClient({
        models: { generateContent: rejectingMethod(), generateContentStream: rejectingMethod() },
      });
      return (signal, stream) => {
        const params = { model: 'gemini-2.5-flash', contents: 'Hello', config: { abortSignal: signal } };
        return stream ? client.models.generateContentStream(params) : client.models.generateContent(params);
      };
    },
  },
  {
    // `decisions.create` has no streaming variant, so `stream` is ignored.
    name: 'google-genai decisions',
    call: () => {
      const client = instrumentGoogleGenAIClient({ decisions: { create: rejectingMethod() } });
      return signal =>
        client.decisions.create({ model: 'models/gemini-3-flash', input: 'Hello', questions: {} }, { signal });
    },
  },
  {
    name: 'mistral',
    call: () => {
      const client = instrumentMistralAiClient({ chat: { complete: rejectingMethod(), stream: rejectingMethod() } });
      return (signal, stream) => {
        const params = { model: 'mistral-small-latest', messages: [] };
        return stream ? client.chat.stream(params, { signal }) : client.chat.complete(params, { signal });
      };
    },
  },
  {
    name: 'mistral with fetchOptions.signal',
    call: () => {
      const client = instrumentMistralAiClient({ chat: { complete: rejectingMethod(), stream: rejectingMethod() } });
      return (signal, stream) => {
        const params = { model: 'mistral-small-latest', messages: [] };
        const requestOptions = { fetchOptions: { signal } };
        return stream ? client.chat.stream(params, requestOptions) : client.chat.complete(params, requestOptions);
      };
    },
  },
  {
    name: 'workers-ai',
    call: () => {
      const client = instrumentWorkersAiClient({ run: rejectingMethod() });
      return (signal, stream) => client.run('@cf/meta/llama-3.1-8b-instruct', { prompt: 'Hello', stream }, { signal });
    },
  },
];

describe.each(providers)('$name caller aborts', ({ call }) => {
  let endedSpans: Span[];

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
        traceLifecycle: 'static',
      }),
    );
    setCurrentClient(client);
    client.init();
    endedSpans = [];
    client.on('spanEnd', span => endedSpans.push(span));
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  async function statusAfterRejection(signal: AbortSignal, stream: boolean): Promise<string | undefined> {
    await expect(call()(signal, stream)).rejects.toThrow('This operation was aborted');
    expect(endedSpans).toHaveLength(1);
    return spanToStaticSpanJSON(endedSpans[0]!).status;
  }

  describe.each([
    { kind: 'streaming', stream: true },
    { kind: 'non-streaming', stream: false },
  ])('$kind request', ({ stream }) => {
    it('marks the span as cancelled when the caller aborts before the response', async () => {
      expect(await statusAfterRejection(AbortSignal.abort(), stream)).toBe('cancelled');
    });

    it("marks the span as errored when the caller's own timeout fired", async () => {
      const timeoutSignal = AbortSignal.abort(new DOMException('The operation timed out', 'TimeoutError'));

      expect(await statusAfterRejection(timeoutSignal, stream)).toBe('internal_error');
    });

    it("marks the span as errored when the request fails without the caller's signal firing", async () => {
      expect(await statusAfterRejection(new AbortController().signal, stream)).toBe('internal_error');
    });
  });
});
