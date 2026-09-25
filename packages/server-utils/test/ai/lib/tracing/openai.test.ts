import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
});
