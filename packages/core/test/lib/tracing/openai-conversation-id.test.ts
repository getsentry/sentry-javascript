import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMainCarrier } from '../../../src/carrier';
import { setCurrentClient } from '../../../src/sdk';
import {
  GEN_AI_CONVERSATION_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
} from '../../../src/tracing/ai/gen-ai-attributes';
import { instrumentOpenAiClient } from '../../../src/tracing/openai';
import type { Span } from '../../../src/types/span';
import { spanToJSON } from '../../../src/utils/spanUtils';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

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
    return spanToJSON(endedSpans[0]!).data ?? {};
  }

  it('reads the Conversations API id from the `conversation` parameter', async () => {
    const instrumented = instrumentOpenAiClient(responsesClient());
    await instrumented.responses.create({ model: 'gpt-4', input: 'hi', conversation: 'conv_abc' });

    expect(data()[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toBe('conv_abc');
  });

  it('does not treat `previous_response_id` chaining as a conversation id', async () => {
    const instrumented = instrumentOpenAiClient(responsesClient());
    await instrumented.responses.create({ model: 'gpt-4', input: 'hi', previous_response_id: 'resp_1' });

    expect(data()[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toBeUndefined();
    expect(data()[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toBe('resp_2');
  });
});
