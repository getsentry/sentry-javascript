import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import { instrumentGoogleGenAIClient } from '../../../../src/ai/google-genai';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

describe('instrumentGoogleGenAIClient span names', () => {
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
    models: { generateContent: ReturnType<typeof vi.fn> };
    chats: { create: ReturnType<typeof vi.fn> };
  } {
    return {
      models: {
        generateContent: vi.fn().mockResolvedValue({ candidates: [] }),
      },
      chats: {
        create: vi.fn().mockReturnValue({ sendMessage: vi.fn() }),
      },
    };
  }

  it('names the span `{operation} {model}` when a model is present', async () => {
    const endedSpans = setupClient('stream');
    const client = fakeClient();
    const instrumented = instrumentGoogleGenAIClient(client);

    await instrumented.models.generateContent({ model: 'gemini-1.5-pro', contents: 'Hello' });

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('generate_content gemini-1.5-pro');
  });

  it('keeps `generate_content unknown` when the model is missing in static mode', async () => {
    const endedSpans = setupClient('static');
    const client = fakeClient();
    const instrumented = instrumentGoogleGenAIClient(client);

    await instrumented.models.generateContent({ contents: 'Hello' });

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('generate_content unknown');
  });

  it('uses the operation name when the model is missing and span streaming is enabled', async () => {
    const endedSpans = setupClient('stream');
    const client = fakeClient();
    const instrumented = instrumentGoogleGenAIClient(client);

    await instrumented.models.generateContent({ contents: 'Hello' });

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('generate_content');
  });

  it('treats an empty-string model as missing', async () => {
    const endedSpans = setupClient('stream');
    const client = fakeClient();
    const instrumented = instrumentGoogleGenAIClient(client);

    await instrumented.models.generateContent({ model: '', contents: 'Hello' });

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('generate_content');
  });

  it('does not start a span for chats.create', () => {
    const endedSpans = setupClient('stream');
    const client = fakeClient();
    const instrumented = instrumentGoogleGenAIClient(client);

    instrumented.chats.create({ model: 'gemini-1.5-pro' });

    expect(endedSpans).toHaveLength(0);
  });
});
