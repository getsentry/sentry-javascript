import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GEN_AI_CONVERSATION_ID, GEN_AI_RESPONSE_ID } from '@sentry/conventions/attributes';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import { instrumentOpenAiClient } from '../../../../src/ai/openai';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

describe('instrumentOpenAiClient conversation id', () => {
  let endedSpans: Span[];

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    const client = new TestClient(
      getDefaultTestClientOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 }),
    );
    setCurrentClient(client);
    client.init();
    endedSpans = [];
    client.on('spanEnd', span => endedSpans.push(span));
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  function responsesClient(): { responses: { create: ReturnType<typeof vi.fn> } } {
    return {
      responses: {
        create: vi.fn().mockResolvedValue({ id: 'resp_2', object: 'response', model: 'gpt-4', output: [] }),
      },
    };
  }

  function data(): Record<string, unknown> {
    return spanToStaticSpanJSON(endedSpans[0]!).data ?? {};
  }

  it('reads the Conversations API id from the `conversation` parameter', async () => {
    const instrumented = instrumentOpenAiClient(responsesClient());
    await instrumented.responses.create({ model: 'gpt-4', input: 'hi', conversation: 'conv_abc' });

    expect(data()[GEN_AI_CONVERSATION_ID]).toBe('conv_abc');
  });

  it('does not treat `previous_response_id` chaining as a conversation id', async () => {
    const instrumented = instrumentOpenAiClient(responsesClient());
    await instrumented.responses.create({ model: 'gpt-4', input: 'hi', previous_response_id: 'resp_1' });

    expect(data()[GEN_AI_CONVERSATION_ID]).toBeUndefined();
    expect(data()[GEN_AI_RESPONSE_ID]).toBe('resp_2');
  });
});
