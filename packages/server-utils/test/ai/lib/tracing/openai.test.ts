import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GEN_AI_OUTPUT_MESSAGES } from '@sentry/conventions/attributes';
import { GEN_AI_DECIDE } from '@sentry/conventions/op';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import { instrumentOpenAiClient } from '../../../../src/ai/openai';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

describe('instrumentOpenAiClient span names', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  function setupClient(traceLifecycle: 'static' | 'stream'): Span[] {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
        traceLifecycle,
      }),
    );
    setCurrentClient(client);
    client.init();

    const endedSpans: Span[] = [];
    client.on('spanEnd', span => endedSpans.push(span));
    return endedSpans;
  }

  function fakeClient(): {
    chat: { completions: { create: ReturnType<typeof vi.fn> } };
  } {
    return {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({ id: 'test', choices: [] }),
        },
      },
    };
  }

  it('names the span `{operation} {model}` when a model is present', async () => {
    const endedSpans = setupClient('stream');
    const client = fakeClient();
    const instrumented = instrumentOpenAiClient(client);

    await instrumented.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('chat gpt-4');
  });

  it('keeps `chat unknown` when the model is missing in static mode', async () => {
    const endedSpans = setupClient('static');
    const client = fakeClient();
    const instrumented = instrumentOpenAiClient(client);

    await instrumented.chat.completions.create({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('chat unknown');
  });

  it('uses the operation name when the model is missing and span streaming is enabled', async () => {
    const endedSpans = setupClient('stream');
    const client = fakeClient();
    const instrumented = instrumentOpenAiClient(client);

    await instrumented.chat.completions.create({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('chat');
  });

  it('treats an empty-string model as missing', async () => {
    const endedSpans = setupClient('stream');
    const client = fakeClient();
    const instrumented = instrumentOpenAiClient(client);

    await instrumented.chat.completions.create({
      model: '',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('chat');
  });

  it('records `decisions.create` as a decide span', async () => {
    const endedSpans = setupClient('stream');
    const instrumented = instrumentOpenAiClient({
      decisions: {
        create: vi.fn().mockResolvedValue({
          model: 'gpt-6-luna',
          answers: [{ type: 'predicate', name: 'wants_refund', probability: 0.97 }],
        }),
      },
    });

    await instrumented.decisions.create({
      model: 'gpt-6-luna',
      input: 'I want a refund',
      questions: [{ type: 'predicate', name: 'wants_refund', instructions: 'Is a refund requested?' }],
    });

    const json = spanToStaticSpanJSON(endedSpans[0]!);
    expect(json.description).toBe('decide gpt-6-luna');
    expect(json.op).toBe(GEN_AI_DECIDE);
    expect(JSON.parse(json.data[GEN_AI_OUTPUT_MESSAGES] as string)).toEqual([
      // Keyed by question name, as the conventions define it.
      { type: 'evaluation', answers: { wants_refund: { type: 'predicate', probability: 0.97 } } },
    ]);
  });

  it('records a boolean decision choice as a string', async () => {
    const endedSpans = setupClient('stream');
    const instrumented = instrumentOpenAiClient({
      decisions: {
        create: vi.fn().mockResolvedValue({
          model: 'gpt-6-luna',
          answers: [
            {
              type: 'choice',
              name: 'is_spam',
              choice: true,
              probabilities: [
                { value: true, probability: 0.91 },
                { value: false, probability: 0.09 },
              ],
              confidence: 0.91,
            },
          ],
        }),
      },
    });

    await instrumented.decisions.create({
      model: 'gpt-6-luna',
      input: 'Win a free cruise!',
      questions: [{ type: 'choice', name: 'is_spam', choices: [{ value: true }, { value: false }] }],
    });

    expect(JSON.parse(spanToStaticSpanJSON(endedSpans[0]!).data[GEN_AI_OUTPUT_MESSAGES] as string)).toEqual([
      {
        type: 'evaluation',
        answers: {
          is_spam: { type: 'choice', choice: 'true', probabilities: { true: 0.91, false: 0.09 }, confidence: 0.91 },
        },
      },
    ]);
  });
});
